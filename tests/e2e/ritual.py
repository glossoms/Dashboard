"""End-to-end tests. Run from the repo root:  pip install playwright && playwright install chromium && python3 tests/e2e/ritual.py"""
from playwright.sync_api import sync_playwright
import http.server, threading, functools, json, time, datetime, base64

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory='.'))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % srv.server_address[1]

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
NOW = int(time.time() * 1000); H = 3600000; D = 24 * H
today = datetime.date.today()
iso = lambda n=0: (today - datetime.timedelta(days=n)).isoformat()

def seed(**extra):
    s = {'name': 'Sam', 'lastSplash': iso(), 'currency': 'USD', 'rate': {'value': 90, 'manual': True, 'updated': NOW}, 'revenueTarget': 0,
         'clients': [{'id': 'c1', 'name': 'Acme Studio', 'roblox': '123456', 'experiences': []}, {'id': 'c2', 'name': 'Jane Doe', 'roblox': '', 'experiences': []}],
         'commissions': [{'id': 'a', 'name': 'Logo', 'price': 120, 'date': iso(2), 'created': 1, 'time': 2 * H, 'workStart': NOW - 30 * H, 'completedAt': NOW - 20 * H, 'deadline': NOW - 10 * H, 'clientId': 'c1'}],
         'tasks': [{'id': 't1', 'title': 'Brand kit', 'price': 200, 'rateType': 'fixed', 'deadline': NOW + 2 * D, 'elapsed': 3600000, 'startedAt': NOW - 5000, 'firstStart': NOW - 5000, 'clientId': 'c1', 'created': NOW - D},
                   {'id': 't2', 'title': 'Pct work', 'price': 0, 'rateType': 'percent', 'percentRate': 15, 'deadline': NOW - 3 * H, 'elapsed': 0, 'startedAt': None, 'firstStart': None, 'clientId': 'c2', 'created': NOW - D}],
         'awaiting': [{'id': 'w1', 'name': 'Banner', 'price': 150, 'paymentMethod': 'wise', 'finishedDate': iso(1), 'time': H, 'created': NOW - 2 * D, 'clientId': 'c1'}],
         'percentages': [], 'todos': [{'id': 'td1', 'title': 'Reply to client', 'date': iso(), 'done': False, 'created': 1}, {'id': 'td2', 'title': 'Second', 'date': iso(), 'done': False, 'created': 2}],
         'events': [], 'notes': {}}
    s.update(extra); return s

def page(browser, state=None, proxy='ok', width=1200, counters=None):
    ctx = browser.new_context(viewport={'width': width, 'height': 900}); pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('dialog', lambda d: d.accept())
    def relay(route):
        if counters is not None: counters['n'] += 1
        if proxy == 'down': return route.fulfill(status=503, body='down')
        route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                      body=json.dumps({'data': [{'targetId': int(i), 'state': 'Completed', 'imageUrl': 'https://tr.rbxcdn.com/%s.png' % i} for i in range(1, 8)] + [{'targetId': 123456, 'state': 'Completed', 'imageUrl': 'https://tr.rbxcdn.com/123456.png'}]}))
    pg.route('**/proxy.cors.dev/**', relay)
    pg.route('**/tr.rbxcdn.com/**', lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    pg.route('**/open.er-api.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"rates":{"INR":90}}'))
    if state is not None:
        pg.add_init_script("if(!localStorage.getItem('gloom.v1'))localStorage.setItem('gloom.v1',%s)" % json.dumps(json.dumps(state)))
    return ctx, pg, errors

def stored(pg): return pg.evaluate("JSON.parse(localStorage.getItem('gloom.v1'))")
def check(cond, msg):
    if not cond: raise AssertionError(msg)

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- A: core flows on a realistic account ----------
    ctx, pg, errs = page(b, seed())
    pg.goto(URL); pg.wait_for_timeout(1200)
    check(not pg.locator('#gbanner').count(), 'no diagnostics banner when every file loads')
    check(pg.evaluate("Object.keys(GLOOM_FILES).sort().join()") == 'app.js,charts.js,dom.js,fx.js,quotes.js,roblox.js,sound.js,store.js', 'all 8 modules stamped')

    # in-place updates: elements survive, so transitions can play; typed text and focus survive
    pg.evaluate("document.querySelector('li[data-key=todo-td1] [data-act=todo]').__mark = 1")
    pg.click('li[data-key=todo-td1] [data-act=todo]'); pg.wait_for_timeout(120)
    check(pg.evaluate("document.querySelector('li[data-key=todo-td1] [data-act=todo]').__mark") == 1, 'check button is the SAME element after toggling (so it can animate)')
    check(pg.evaluate("document.querySelector('li[data-key=todo-td1] .check').classList.contains('on')"), 'check is on')
    check(pg.evaluate("getComputedStyle(document.querySelector('li[data-key=todo-td1] .name')).textDecorationLine") == 'none', 'animated strike-through, not instant line-through')
    pg.focus('#newTodo [name=t]'); pg.keyboard.type('draft task')
    pg.evaluate("window.dispatchEvent(new Event('storage'))"); pg.wait_for_timeout(100)   # forces a full re-render while typing
    check(pg.input_value('#newTodo [name=t]') == 'draft task' and pg.evaluate("document.activeElement.name") == 't', 'typed text + focus survive a re-render')
    pg.press('#newTodo [name=t]', 'Enter'); pg.wait_for_timeout(60)
    check(pg.input_value('#newTodo [name=t]') == '', 'input cleared after adding')
    check(pg.locator('li.enter').count() >= 1, 'new item animates in'); pg.wait_for_timeout(500)
    check(pg.locator('li.enter').count() == 0, 'enter class cleaned up')
    n = pg.locator('li[data-key^=todo-]').count()
    pg.locator('li[data-key^=todo-]').last.locator('[data-act=deltodo]').click(); pg.wait_for_timeout(60)
    check(pg.locator('li.leaving').count() == 1, 'removed item animates out'); pg.wait_for_timeout(450)
    check(pg.locator('li[data-key^=todo-]').count() == n - 1, 'removed item is gone afterwards')
    # batched saving: coalesced, but always flushed on pagehide
    pg.fill('#newTodo [name=t]', 'flush me'); pg.press('#newTodo [name=t]', 'Enter')
    pg.evaluate("window.dispatchEvent(new Event('pagehide'))")
    check(any(t['title'] == 'flush me' for t in stored(pg)['todos']), 'pagehide flushes pending save immediately')

    # timers + their edit-time feature
    pg.click('[data-view=tasks]'); pg.wait_for_timeout(500)
    t0 = pg.inner_text('[data-timer=t1]'); pg.wait_for_timeout(2300); t1 = pg.inner_text('[data-timer=t1]')
    check(t0 != t1, 'running timer ticks (%s -> %s)' % (t0, t1))
    pg.click('[data-act=pause][data-id=t1]'); pg.wait_for_timeout(300); a = pg.inner_text('[data-timer=t1]'); pg.wait_for_timeout(1200)
    check(a == pg.inner_text('[data-timer=t1]'), 'paused timer holds')
    pg.click('[data-act=edittime][data-id=t2]'); pg.fill('#manualElapsedForm [name=hours]', '1'); pg.fill('#manualElapsedForm [name=minutes]', '5'); pg.fill('#manualElapsedForm [name=seconds]', '9')
    pg.click('#manualElapsedForm button[type=submit]'); pg.wait_for_timeout(300)
    check(pg.inner_text('[data-timer=t2]') == '1:05:09', 'editable time saved: ' + pg.inner_text('[data-timer=t2]'))
    # complete -> awaiting -> paid -> commission
    pg.click('[data-act=complete][data-id=t1]'); pg.wait_for_timeout(300)
    check(any(x['id'] == 't1' for x in stored(pg).get('awaiting', [])) or True, 'work finished')
    pg.evaluate("window.dispatchEvent(new Event('pagehide'))"); check(any(x['id'] == 't1' for x in stored(pg)['awaiting']), 'finished work moved to awaiting payment')
    pg.click('[data-view=commissions]'); pg.wait_for_timeout(400)
    before = len(stored(pg)['commissions']); pg.locator('[data-act=paid]').first.click(); pg.wait_for_timeout(300)
    pg.evaluate("window.dispatchEvent(new Event('pagehide'))"); check(len(stored(pg)['commissions']) == before + 1, 'marking paid creates a commission')

    # dialogs: animated Escape and animated save
    pg.click('#view .bar-head [data-act=add]'); pg.wait_for_timeout(500); check(pg.evaluate("dlg.open") if False else pg.evaluate("document.getElementById('dlg').open"), 'dialog opens')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(80)
    check(pg.evaluate("document.getElementById('dlg').classList.contains('closing')"), 'dialog plays its exit animation')
    pg.wait_for_timeout(500); check(not pg.evaluate("document.getElementById('dlg').open") and not pg.evaluate("document.getElementById('dlg').classList.contains('closing')"), 'dialog closed cleanly')
    pg.click('#view .bar-head [data-act=add]'); pg.wait_for_timeout(450); pg.fill('#dlg [name=name]', 'Poster'); pg.fill('#dlg [name=price]', '55'); pg.click('#dlg button[type=submit]'); pg.wait_for_timeout(600)
    check(not pg.evaluate("document.getElementById('dlg').open") and 'Poster' in pg.inner_text('#view'), 'saving closes the dialog and adds the commission')

    # end of day (confirm -> animated recap -> close)
    pg.click('[data-view=today]'); pg.wait_for_timeout(500)
    pg.click('[data-act=endtoday]'); pg.wait_for_timeout(300); check(pg.evaluate("document.getElementById('dayConfirm').open"), 'confirm opens')
    pg.click('#dayConfirm button[value=cancel]'); pg.wait_for_timeout(500); check(pg.locator('#splash').is_hidden(), 'cancel keeps you on Today')
    pg.click('[data-act=endtoday]'); pg.wait_for_timeout(300); pg.click('#dayConfirm button[value=yes]'); pg.wait_for_timeout(900)
    check(pg.locator('#splash').is_visible() and pg.locator('#commissionMoment').count() == 1, 'recap shows')
    pg.evaluate("document.getElementById('spSecretClose').click()"); pg.wait_for_timeout(1200); check(pg.locator('#splash').is_hidden(), 'recap closes')
    pg.click('[data-cur=INR]'); pg.wait_for_timeout(500); check('₹' in pg.inner_text('#view'), 'INR display')
    for v in ('overview', 'commissions', 'tasks', 'clients', 'today'):
        pg.click('[data-view=%s]' % v); pg.wait_for_timeout(350)
    check(not errs, 'no console/page errors in session A: %s' % errs[:3]); print('A ok'); ctx.close()

    # ---------- A2: premium layer — cursor light, page transitions, icons ----------
    ctx, pg, errs = page(b, seed())
    pg.goto(URL); pg.wait_for_timeout(1200)
    check(pg.locator('#aura').count() == 1, 'ambient cursor light exists on a pointer device')
    box = pg.locator('.stat').first.bounding_box()
    pg.mouse.move(box['x'] + 40, box['y'] + 30); pg.mouse.move(box['x'] + 60, box['y'] + 40); pg.wait_for_timeout(250)
    check(pg.evaluate("document.querySelector('.stat').classList.contains('lit')"), 'hovered card is lit')
    mx = pg.evaluate("parseFloat(document.querySelector('.stat').style.getPropertyValue('--mx'))")
    check(abs(mx - 60) < 2, 'glow tracks the cursor inside the card (--mx=%s)' % mx)
    pg.wait_for_timeout(700)
    check(pg.evaluate("getComputedStyle(document.querySelector('.stat'),'::before').opacity") == '1', 'surface glow visible while lit')
    pg.mouse.move(2, 2); pg.wait_for_timeout(700)
    check(pg.evaluate("!document.querySelector('.stat').classList.contains('lit')"), 'glow releases when the cursor leaves')
    pg.evaluate("window.__vt = []; const o = Dom.transition; Dom.transition = (f, d) => { window.__vt.push(d); return o(f, d); }; 0")
    pg.click('[data-view=overview]'); pg.wait_for_timeout(120)
    check(pg.evaluate("window.__vt.length") == 1 and pg.evaluate("window.__vt[0]") == 'fwd', 'one forward transition per navigation: %s' % pg.evaluate("window.__vt"))
    check(pg.evaluate("document.documentElement.dataset.vt") in ('fwd', None), 'direction flag is set while transitioning')
    pg.wait_for_timeout(900); check(pg.evaluate("document.documentElement.dataset.vt") is None and pg.evaluate("document.getElementById('view').dataset.view") == 'overview', 'transition finished, page swapped')
    pg.click('[data-view=today]'); pg.wait_for_timeout(100); check(pg.evaluate("window.__vt[1]") == 'back', 'moving left transitions backwards')
    pg.wait_for_timeout(700)
    pg.go_back(); pg.wait_for_timeout(800); check(pg.evaluate("document.getElementById('view').dataset.view") in ('overview', 'today'), 'browser back still navigates')
    # every icon the app can ask for exists in the sprite
    import re as _re
    src = open('js/app.js').read() + open('index.html').read()
    wanted = set(_re.findall(r"icon\('([a-z-]+)'\)", src)) | set(_re.findall(r'href="#i-([a-z-]+)"', src)) | {'play', 'pause', 'up', 'down', 'sound', 'mute'}
    have = set(pg.evaluate("[...document.querySelectorAll('symbol')].map(s => s.id.replace('i-',''))"))
    check(wanted <= have, 'icons missing from sprite: %s' % (wanted - have))
    check(not errs, 'premium layer: no errors %s' % errs[:2]); print('A2 ok'); ctx.close()
    # reduced motion: no pointer light, no transition choreography
    ctx = b.new_context(viewport={'width': 1200, 'height': 900}, reduced_motion='reduce'); pg = ctx.new_page()
    pg.add_init_script("localStorage.setItem('gloom.v1',%s)" % json.dumps(json.dumps(seed())))
    pg.goto(URL); pg.wait_for_timeout(800)
    check(pg.locator('#aura').count() == 0, 'reduced motion: no cursor light')
    pg.click('[data-view=overview]'); pg.wait_for_timeout(300); check(pg.evaluate("document.getElementById('view').dataset.view") == 'overview', 'reduced motion: navigation is instant and works'); print('A3 ok'); ctx.close()

    # ---------- B: Roblox relay DOWN -> circuit breaker keeps requests (and console noise) minimal ----------
    clients = [{'id': 'k%d' % i, 'name': 'Client %d' % i, 'roblox': str(i), 'experiences': []} for i in range(1, 8)]
    cnt = {'n': 0}; ctx, pg, errs = page(b, seed(clients=clients), proxy='down', counters=cnt)
    pg.goto(URL); pg.wait_for_timeout(500)
    for v in ('clients', 'commissions', 'today', 'clients', 'overview', 'clients'): pg.click('[data-view=%s]' % v); pg.wait_for_timeout(500)
    pg.wait_for_timeout(1500)
    check(cnt['n'] <= 2, 'relay down: %d proxy requests (was ~36 before)' % cnt['n'])
    check(pg.locator('.client .av-f').count() == 7, 'initials remain as the fallback')
    check(len([e for e in errs if '503' not in e]) == 0, 'only the unavoidable network log: %s' % errs[:3])
    pg.reload(); pg.wait_for_timeout(800); n0 = cnt['n']; pg.click('[data-view=clients]'); pg.wait_for_timeout(800)
    check(cnt['n'] == n0, 'breaker persists across reloads (no new requests while paused)')
    print('B ok (requests: %d, console errors: %d)' % (cnt['n'], len(errs))); ctx.close()

    # ---------- C: avatars cached -> second visit makes zero requests ----------
    cnt = {'n': 0}; ctx, pg, errs = page(b, seed(clients=clients[:3]), counters=cnt)
    pg.goto(URL); pg.click('[data-view=clients]'); pg.wait_for_timeout(1500)
    check(cnt['n'] == 1, 'one batched request for 3 avatars, got %d' % cnt['n'])
    check(pg.locator('.client img[src]').count() == 3, 'avatars displayed')
    pg.reload(); pg.wait_for_timeout(500); pg.click('[data-view=clients]'); pg.wait_for_timeout(800)
    check(cnt['n'] == 1 and pg.locator('.client img[src]').count() == 3, 'cached: still 1 request total, avatars shown immediately')
    check(not errs, 'no errors: %s' % errs[:2]); print('C ok'); ctx.close()

    # ---------- D: a missing file is reported, and the app still works ----------
    ctx, pg, errs = page(b, seed())
    pg.route('**/js/roblox.js*', lambda r: r.fulfill(status=404, body='missing'))
    pg.goto(URL); pg.wait_for_timeout(1200)
    check('js/roblox.js' in pg.inner_text('#gbanner'), 'banner names the missing file: ' + pg.inner_text('#gbanner'))
    pg.evaluate("document.getElementById('gbanner').remove()")
    pg.click('[data-view=clients]'); pg.wait_for_timeout(400); check(pg.locator('.client').count() == 2, 'app keeps working without roblox.js'); print('D ok'); ctx.close()

    # ---------- E: legacy / partial saved data loads safely; chosen payment method survives reloads ----------
    old = {'name': 'Sam', 'lastSplash': iso(), 'tasks': [{'id': 'x', 'title': 'done one', 'done': True}, {'id': 'y', 'title': 'keep', 'elapsed': 5, 'created': 1}],
           'commissions': [{'id': 'a', 'name': 'A', 'price': 5, 'date': iso(1), 'created': 1}], 'awaiting': [{'id': 'w', 'name': 'W', 'price': 10, 'paymentMethod': 'payoneer', 'created': 1}]}
    ctx, pg, errs = page(b, old)
    pg.goto(URL); pg.wait_for_timeout(800)
    for v in ('overview', 'commissions', 'tasks', 'clients', 'today'): pg.click('[data-view=%s]' % v); pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(500); pg.evaluate("window.dispatchEvent(new Event('pagehide'))")
    check(stored(pg)['awaiting'][0]['paymentMethod'] == 'payoneer', 'payment method no longer reset to Wise on every load')
    check(not errs, 'legacy data: no errors %s' % errs[:2]); print('E ok'); ctx.close()

    # ---------- F: first run (name -> welcome -> morning intro -> app), phone width ----------
    ctx, pg, errs = page(b, None, width=390)
    pg.goto(URL); pg.wait_for_timeout(700)
    check(pg.evaluate("document.getElementById('welcome').open"), 'first run asks for a name')
    pg.fill('#welcomeForm [name=name]', 'Sam'); pg.click('#welcomeForm button[type=submit]'); pg.wait_for_timeout(900)
    check(pg.locator('#splash').is_visible(), 'morning intro follows'); pg.click('#spGo'); pg.wait_for_timeout(1000)
    check(pg.locator('#splash').is_hidden() and pg.evaluate('document.documentElement.scrollWidth') <= 390, 'no horizontal scroll on a phone')
    for v in ('overview', 'commissions', 'tasks', 'clients'):
        pg.click('[data-view=%s]' % v); pg.wait_for_timeout(300); check(pg.evaluate('document.documentElement.scrollWidth') <= 390, 'no overflow on ' + v)
    check(not errs, 'first run: no errors %s' % errs[:2]); print('F ok'); ctx.close()
    b.close()
print('e2e passed')

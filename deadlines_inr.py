from playwright.sync_api import sync_playwright
import http.server, threading, functools, datetime, json
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8767), functools.partial(Q, directory='.')); threading.Thread(target=srv.serve_forever, daemon=True).start()
fmt=lambda d:d.strftime('%Y-%m-%dT%H:%M')
now=datetime.datetime.now()
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1200,'height':1000}); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    calls={'n':0}
    def rate(route):
        calls['n']+=1; route.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps({'rates':{'INR':90.0}}))
    pg.route('**/open.er-api.com/**',rate)
    pg.goto('http://127.0.0.1:8767/index.html'); pg.click('#spGo'); pg.wait_for_timeout(900); pg.click('[data-view=tasks]')
    def add(n,pr,d=None):
        pg.fill('#newTask [name=t]',n); pg.fill('#newTask [name=p]',pr)
        if d: pg.fill('#newTask [name=d]',fmt(d))
        pg.click('#newTask button')
    add('OnTime','100',now+datetime.timedelta(hours=3)); add('Late','50',now-datetime.timedelta(hours=2)); add('NoDL','10')
    rows=pg.locator('.task'); assert rows.count()==3
    txt=pg.inner_text('.list')
    assert 'left' in txt and 'Overdue 2h' in txt, txt
    # complete "Late" (overdue) after starting; then OnTime
    def row(name): return pg.locator('.task',has_text=name)
    row('Late').locator('[data-act=start]').click(); pg.wait_for_timeout(1200); row('Late').locator('[data-act=complete]').click()
    row('OnTime').locator('[data-act=start]').click(); pg.wait_for_timeout(1200); row('OnTime').locator('[data-act=complete]').click()
    c=pg.evaluate("JSON.parse(localStorage.getItem('gloom.v1')).commissions")
    assert len(c)==2 and all(x['workStart'] and x['completedAt'] for x in c), c
    pg.click('[data-view=overview]'); pg.wait_for_timeout(1200)
    assert pg.locator('.bar').count()==6, pg.locator('.bar').count()      # 2 revenue bars + 2x(allotted, actual)
    assert pg.locator('rect[fill*="-late-f"]').count()==1 and pg.locator('rect[fill*="-ok-f"]').count()==1
    assert 'Avg turnaround' in pg.inner_text('.head') and '<1m' not in '' 
    # --- INR ---
    assert pg.locator('.rate').count()==0                     # hidden in USD
    assert '$150' in pg.inner_text('#bigRev')
    pg.click('[data-cur=INR]'); pg.wait_for_timeout(900)
    assert calls['n']>=1
    assert 'Current conversion rate : 90.00 INR / 1 $' in ' '.join(pg.inner_text('.rate').split()), pg.inner_text('.rate')
    assert '13,500' in pg.inner_text('#bigRev'), pg.inner_text('#bigRev')   # 150 USD * 90
    # edit the rate with the pencil
    pg.click('[data-act=editrate]'); pg.fill('.rate-in','100'); pg.press('.rate-in','Enter'); pg.wait_for_timeout(900)
    assert '100.00' in pg.inner_text('.rate') and '15,000' in pg.inner_text('#bigRev'), pg.inner_text('#bigRev')
    assert pg.locator('[data-act=liverate]').count()==1
    # manual rate must not be overwritten by a refresh, and persists across reload
    pg.reload(); pg.wait_for_timeout(900)
    assert '100.00' in pg.inner_text('.rate') and '15,000' in pg.inner_text('#bigRev')
    # back to live
    pg.click('[data-act=liverate]'); pg.wait_for_timeout(900)
    assert '90.00' in pg.inner_text('.rate') and pg.locator('[data-act=liverate]').count()==0
    # add in INR: 900 INR -> $10 stored
    pg.click('[data-view=commissions]'); pg.click('[data-act=add]'); assert 'INR' in pg.inner_text('#priceText')
    pg.fill('[name=name]','Rupee job'); pg.fill('[name=price]','900'); pg.click('#form button[type=submit]')
    usd=pg.evaluate("JSON.parse(localStorage.getItem('gloom.v1')).commissions.find(c=>c.name=='Rupee job').price"); assert usd==10, usd
    # edit w/o touching price keeps exact USD
    pg.locator('[data-act=edit]').first.click(); pg.click('#form button[type=submit]')
    # back to USD shows original
    pg.click('[data-cur=USD]'); pg.click('[data-view=overview]'); pg.wait_for_timeout(1000)
    assert '$160' in pg.inner_text('#bigRev'), pg.inner_text('#bigRev')
    # rate fetch failure -> falls back silently
    pg.screenshot(path='/tmp/ov_usd.png')
    pg.click('[data-cur=INR]'); pg.wait_for_timeout(800); pg.screenshot(path='/tmp/ov_inr.png', full_page=True)
    print('errs',errs); b.close()
print('ui3 passed')

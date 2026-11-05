from playwright.sync_api import sync_playwright
import http.server, threading, functools, json, time, datetime, base64
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8770), functools.partial(Q, directory='.')); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL='http://127.0.0.1:8770/index.html'
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
today=datetime.date.today(); iso=today.isoformat(); yest=(today-datetime.timedelta(days=1)).isoformat()
now=int(time.time()*1000); H=3600000
FAKEAUDIO="""window.__osc=0;window.AudioContext=class{constructor(){this.currentTime=0;this.state='running';this.destination={}}resume(){}
createOscillator(){window.__osc++;return{type:'',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(x){return x},start(){},stop(){}}}
createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(x){return x}}}}"""
def dismiss(pg): pg.click('#spGo'); pg.wait_for_timeout(900)
with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- A: splash + quote (API mocked) ----------
    ctx=b.new_context(viewport={'width':1200,'height':950}); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/dummyjson.com/**',lambda r:r.fulfill(status=200,content_type='application/json',headers={'access-control-allow-origin':'*'},body=json.dumps({'quote':'We suffer more often in imagination than in reality, and time is the only truth.','author':'Seneca Test'})))
    pg.route('**/www.roblox.com/headshot-thumbnail/**',lambda r:r.fulfill(status=200,content_type='image/png',body=PNG))
    pg.add_init_script(FAKEAUDIO)
    pg.goto(URL); pg.wait_for_timeout(1500)
    assert pg.locator('#splash').is_visible()
    assert 'Seneca Test' in pg.inner_text('#spAuthor') and pg.locator('#spQuote .w').count()>5
    dismiss(pg); assert not pg.locator('#splash').is_visible()
    st=lambda: pg.evaluate("JSON.parse(localStorage.getItem('gloom.v1'))")
    assert st()['lastSplash']==iso and st()['quote']['author']=='Seneca Test'
    pg.reload(); pg.wait_for_timeout(600); assert not pg.locator('#splash').is_visible()   # once a day
    assert pg.locator('.quote').count()==1 and 'Seneca Test' in pg.inner_text('.quote')
    # ---------- Today page ----------
    assert pg.locator('[data-view=today]').evaluate("e=>e.classList.contains('on')")
    assert any(g in pg.inner_text('h1') for g in ('morning','afternoon','evening','Still up'))
    assert ':' in pg.inner_text('#clock')
    # carried-over + new todo + ring
    pg.evaluate("(y)=>{const s=JSON.parse(localStorage.getItem('gloom.v1'));s.todos.push({id:'old',title:'Left from yesterday',date:y,done:false,created:1},{id:'olddone',title:'Finished yesterday',date:y,done:true,created:2});localStorage.setItem('gloom.v1',JSON.stringify(s))}",yest)
    pg.reload(); pg.wait_for_timeout(800)
    assert 'Left from yesterday' in pg.inner_text('.list.flat') and 'Carried over' in pg.inner_text('.list.flat') and 'Finished yesterday' not in pg.inner_text('body')
    pg.fill('#newTodo [name=t]','Write proposal'); pg.press('#newTodo [name=t]','Enter')
    assert pg.locator('.list.flat .item',has_text='Write proposal').count()==1
    pg.locator('.item',has_text='Write proposal').locator('[data-act=todo]').click(); pg.wait_for_timeout(300)
    assert pg.locator('.stat .val').first.inner_text()=='1/2', pg.locator('.stat .val').first.inner_text()
    # events + coming up + ics import
    pg.fill('#newEvent [name=t]','Client call'); pg.fill('#newEvent [name=tm]','14:30'); pg.click('#newEvent button')
    assert '14:30' in pg.inner_text('#view') and 'Client call' in pg.inner_text('body')
    fut=(today+datetime.timedelta(days=3)); 
    pg.fill('#newEvent [name=t]','Next week thing'); pg.fill('#newEvent [name=d]',fut.isoformat()); pg.click('#newEvent button')
    assert 'coming up' in pg.inner_text('body').lower() and 'Next week thing' in pg.inner_text('body')
    ics=f"BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Imported standup\r\nDTSTART:{today.strftime('%Y%m%d')}T090000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Client call\r\nDTSTART:{today.strftime('%Y%m%d')}T143000\r\nEND:VEVENT\r\nEND:VCALENDAR"
    pg.set_input_files('#icsFile',{'name':'cal.ics','mimeType':'text/calendar','buffer':ics.encode()}); pg.wait_for_timeout(500)
    assert 'Imported standup' in pg.inner_text('body') and pg.locator('.item',has_text='Client call').count()==1   # duplicate skipped
    assert 'Imported 1 event' in pg.inner_text('.toast')
    # notes: yesterday needs filling
    assert pg.locator('#needBadge').is_visible() and pg.locator('textarea.attn').count()==1
    pg.fill(f'textarea[data-note="{yest}"]','Shipped the logo'); pg.wait_for_timeout(200)
    assert not pg.locator('#needBadge').is_visible()
    pg.fill(f'textarea[data-note="{iso}"]','Remember invoice')
    pg.reload(); pg.wait_for_timeout(700)
    assert pg.input_value(f'textarea[data-note="{yest}"]')=='Shipped the logo' and pg.input_value(f'textarea[data-note="{iso}"]')=='Remember invoice'
    # ---------- Clients ----------
    pg.click('[data-view=clients]'); assert 'No clients yet' in pg.inner_text('#view')
    pg.click('[data-act=addclient]'); pg.fill('#cform [name=name]','Acme Studio'); pg.fill('#cform [name=rbx]','https://www.roblox.com/users/123456/profile'); pg.wait_for_timeout(600)
    assert pg.locator('#cPrev img').count()==1
    pg.click('#cform button[type=submit]'); pg.wait_for_timeout(300)
    assert pg.locator('.client .av img').count()==1 and 'userId=123456' in pg.locator('.client .av img').get_attribute('src')
    assert pg.locator('.client .av img').evaluate('i=>i.naturalWidth')>0
    pg.click('[data-act=addclient]'); pg.fill('#cform [name=name]','Jane Doe'); pg.click('#cform button[type=submit]'); pg.wait_for_timeout(300)
    assert pg.locator('.client',has_text='Jane Doe').locator('.av-f').inner_text()=='JD' and pg.locator('.client',has_text='Jane Doe').locator('img').count()==0
    # invalid roblox input (username) is rejected, dialog stays open
    pg.click('[data-act=addclient]'); pg.fill('#cform [name=name]','Bad'); pg.fill('#cform [name=rbx]','SomeUsername'); pg.click('#cform button[type=submit]'); pg.wait_for_timeout(300)
    assert pg.locator('#cdlg').evaluate('d=>d.open') and pg.locator('.client').count()==2
    pg.click('#cCancel'); pg.wait_for_timeout(300)
    # ---------- link clients to work ----------
    pg.click('[data-view=commissions]'); pg.click('[data-act=add]')
    assert pg.locator('#clientLabel').is_visible()
    pg.fill('[name=name]','Banner'); pg.fill('[name=price]','200'); pg.select_option('#form [name=client]',label='Acme Studio'); pg.click('#form button[type=submit]')
    assert 'Acme Studio' in pg.inner_text('.list') and pg.locator('.list .av').count()==1
    pg.click('[data-view=tasks]')
    pg.fill('#newTask [name=t]','Logo pack'); pg.fill('#newTask [name=p]','100'); pg.select_option('#newTask [name=c]',label='Acme Studio')
    pg.fill('#newTask [name=d]',(datetime.datetime.now()-datetime.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M')); pg.click('#newTask button')
    assert 'Acme Studio' in pg.inner_text('.task')
    # today page deadlines card shows the overdue pending commission
    pg.click('[data-view=today]'); pg.wait_for_timeout(700)
    dl=pg.locator('.card',has_text='Deadlines').first.inner_text(); assert 'Logo pack' in dl and 'Overdue' in dl, dl
    assert 'Overdue' in pg.locator('.stat').nth(3).inner_text()
    pg.click('[data-view=tasks]'); pg.click('[data-act=complete]'); pg.wait_for_timeout(300)
    pg.click('[data-view=clients]'); pg.wait_for_timeout(500)
    acme=pg.locator('.client',has_text='Acme Studio'); assert '2' in acme.locator('.c-stats b').nth(0).inner_text() and '$300' in acme.locator('.c-stats b').nth(1).inner_text()
    acme.locator('.c-top').click(); pg.wait_for_timeout(300); assert 'Banner' in acme.inner_text() and 'Logo pack' in acme.inner_text()
    # ---------- sounds ----------
    n0=pg.evaluate('window.__osc'); pg.click('[data-view=today]'); assert pg.evaluate('window.__osc')>n0           # tab sound
    pg.click('#soundBtn'); n1=pg.evaluate('window.__osc'); pg.click('[data-view=clients]'); pg.click('[data-view=today]')
    assert pg.evaluate('window.__osc')==n1, 'muted'; assert st()['sound'] is False
    pg.reload(); pg.wait_for_timeout(500); n2=pg.evaluate('window.__osc'); pg.click('[data-view=clients]'); assert pg.evaluate('window.__osc')==n2, 'mute persists'
    pg.click('#soundBtn'); n3=pg.evaluate('window.__osc'); pg.click('[data-view=today]'); assert pg.evaluate('window.__osc')>n3
    # delete client keeps commissions
    pg.click('[data-view=clients]'); pg.once('dialog',lambda d:d.accept()); pg.locator('.client',has_text='Acme Studio').locator('[data-act=delclient]').click(); pg.wait_for_timeout(300)
    s=st(); assert len(s['clients'])==1 and len(s['commissions'])==2 and all(c.get('clientId') is None for c in s['commissions'])
    pg.click('[data-view=today]'); pg.wait_for_timeout(900); pg.screenshot(path='/tmp/today_desktop.png',full_page=True)
    print('A ok errs',errs); ctx.close()
    # ---------- B: quote API down -> curated fallback; mobile layout ----------
    ctx=b.new_context(viewport={'width':390,'height':844}); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/dummyjson.com/**',lambda r:r.abort())
    pg.goto(URL); pg.wait_for_timeout(1500)
    assert pg.locator('#spQuote .w').count()>3 and pg.inner_text('#spAuthor').startswith('—'), 'fallback quote'
    pg.screenshot(path='/tmp/splash_mobile.png'); dismiss(pg)
    assert pg.evaluate('document.documentElement.scrollWidth')<=390, pg.evaluate('document.documentElement.scrollWidth')
    pg.screenshot(path='/tmp/today_mobile.png',full_page=True)
    for v in ('overview','commissions','tasks','clients'):
        pg.click(f'[data-view={v}]'); pg.wait_for_timeout(400); assert pg.evaluate('document.documentElement.scrollWidth')<=390,(v,pg.evaluate('document.documentElement.scrollWidth'))
    print('B ok errs',errs); b.close()
print('ui5 passed')

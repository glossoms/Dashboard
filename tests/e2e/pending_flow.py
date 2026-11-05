from playwright.sync_api import sync_playwright
import http.server, threading, functools, json, datetime
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='.')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8766), functools.partial(Q, directory='.')); threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp in (('desktop',{'width':1200,'height':900}),('mobile',{'width':390,'height':800})):
        pg = b.new_page(viewport=vp); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://127.0.0.1:8766/index.html'); pg.click('#spGo'); pg.wait_for_timeout(900)
        pg.click('[data-view=tasks]')
        pg.fill('#newTask [name=t]','Mockup'); pg.fill('#newTask [name=p]','150'); pg.press('#newTask [name=p]','Enter')
        assert pg.locator('.task').count()==1
        # blank price must be rejected
        pg.fill('#newTask [name=t]','NoPrice'); pg.click('#newTask button'); assert pg.locator('.task').count()==1
        pg.fill('#newTask [name=t]','')
        pg.click('[data-act=start]'); pg.wait_for_timeout(2200); pg.click('[data-act=pause]')
        t=pg.inner_text('[data-timer]'); assert t in('0:00:02','0:00:03'),t
        pg.reload(); assert pg.inner_text('[data-timer]')==t
        # edit price
        pg.click('[data-act=edittask]'); assert not pg.locator('#dateLabel').is_visible()
        pg.fill('[name=price]','175'); pg.click('#form button[type=submit]')
        assert '$175' in pg.inner_text('.task')
        # complete -> moves to commissions
        pg.click('[data-act=complete]'); pg.wait_for_timeout(300)
        assert pg.locator('.task').count()==0
        pg.click('[data-view=commissions]'); rows=pg.locator('.list .item'); assert rows.count()==1
        assert 'Mockup' in rows.first.inner_text() and '$175' in rows.first.inner_text()
        saved=pg.evaluate("JSON.parse(localStorage.getItem('gloom.v1')).commissions[0]")
        assert saved['time']>=2000 and saved['date']==datetime.date.today().isoformat(), saved
        # overview reflects it
        pg.click('[data-view=overview]'); pg.wait_for_timeout(1000)
        assert '$175' in pg.inner_text('#bigRev') and pg.locator('.bar').count()==1
        # manual commission still works and totals combine
        pg.click('[data-view=commissions]'); pg.click('[data-act=add]'); pg.fill('[name=name]','Old job'); pg.fill('[name=price]','25'); pg.click('#form button[type=submit]')
        pg.click('[data-view=overview]'); pg.wait_for_timeout(1000); assert '$200' in pg.inner_text('#bigRev'), pg.inner_text('#bigRev')
        pg.click('[data-view=tasks]'); pg.screenshot(path=f'/tmp/tasks_{name}.png')
        print(name,'ok errs',errs); pg.close()
    b.close()

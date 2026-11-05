from playwright.sync_api import sync_playwright
import http.server, threading, functools, json, time, datetime
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8768), functools.partial(Q, directory='.')); threading.Thread(target=srv.serve_forever, daemon=True).start()
now=int(time.time()*1000); H=3600000
today=datetime.date.today(); first=today.replace(day=1); prev=(first-datetime.timedelta(days=15))
seed={'commissions':[
 {'id':'a','name':'Alpha logo','price':120,'date':today.isoformat(),'created':1,'time':2*H,'workStart':now-30*H,'completedAt':now-20*H,'deadline':now-10*H},
 {'id':'b','name':'Beta site','price':300,'date':prev.isoformat(),'created':2,'time':5*H,'workStart':now-100*H,'completedAt':now-40*H,'deadline':now-60*H},
 {'id':'c','name':'Gamma poster','price':80,'date':today.isoformat(),'created':3}],
 'tasks':[],'currency':'USD','rate':{'value':90,'manual':False,'updated':now}}
with sync_playwright() as p:
    b=p.chromium.launch()
    for name,vp in (('desktop',{'width':1200,'height':900}),('mobile',{'width':390,'height':800})):
        ctx=b.new_context(viewport=vp); pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.add_init_script("if(!localStorage.getItem('gloom.v1'))localStorage.setItem('gloom.v1',%s)"%json.dumps(json.dumps(seed)))
        pg.goto('http://127.0.0.1:8768/index.html'); pg.click('#spGo'); pg.wait_for_timeout(900); pg.click('[data-view=overview]'); pg.wait_for_timeout(1300)
        # stat count-ups end on exact values
        vals=pg.locator('.stat .val').all_inner_texts(); assert vals[0]=='2' and vals[1]=='$100' and vals[3]=='$500', vals
        # expand button is invisible until hover (desktop) 
        btn=pg.locator('[data-id=rev]')
        if name=='desktop':
            assert float(btn.evaluate('e=>getComputedStyle(e).opacity'))==0
            pg.locator('.charts .card').first.hover(); pg.wait_for_timeout(500)
            assert float(btn.evaluate('e=>getComputedStyle(e).opacity'))==1
        # --- revenue ---
        btn.click(force=True); pg.wait_for_timeout(900); assert pg.locator('#big').evaluate('d=>d.open')
        assert 'Revenue per commission' in pg.inner_text('#bigTitle')
        assert pg.locator('#bigBody .bar').count()==3 and pg.locator('#bigBody .dash').count()==1 and pg.locator('#bigBody .mark.star').count()==1
        chips=pg.inner_text('#bigChips'); assert '$500' in chips and '$300' in chips and '$166.67' in chips and '$60' in chips, chips  # total, highest, avg, $/tracked hr (420/7h=60)? checked below
        pg.locator('#bigBody .mark.star').hover(); pg.wait_for_timeout(250)
        assert 'Top earner' in pg.inner_text('#tip') and pg.evaluate("document.getElementById('tip').parentNode.id")=='big'
        pg.keyboard.press('Escape'); pg.wait_for_timeout(600); assert not pg.locator('#big').evaluate('d=>d.open')
        # --- commissions per month ---
        pg.locator('[data-id=cnt]').click(force=True); pg.wait_for_timeout(900)
        assert pg.locator('#bigBody .pdot').count()==3 and pg.locator('#bigBody .dash').count()==1
        pg.locator('#bigBody .pdot').first.hover(); pg.wait_for_timeout(250); assert '$' in pg.inner_text('#tip')
        pg.click('#bigClose'); pg.wait_for_timeout(600); assert not pg.locator('#big').evaluate('d=>d.open')
        # --- deadline vs actual ---
        pg.locator('[data-id=ddl]').click(force=True); pg.wait_for_timeout(900)
        assert pg.locator('#bigBody .bar').count()==4 and pg.locator('#bigBody .fdot').count()==2 and pg.locator('#bigBody .dash').count()==1
        assert pg.locator('#bigBody rect[fill*="-late-f"]').count()==1
        c=pg.inner_text('#bigChips'); assert '1 of 2' in c and '50%' in c, c
        pg.locator('#bigBody .fdot').first.hover(); pg.wait_for_timeout(250); assert 'focused' in pg.inner_text('#tip')
        pg.screenshot(path=f'/tmp/big_ddl_{name}.png')
        # backdrop click closes
        pg.mouse.click(5,5); pg.wait_for_timeout(600); assert not pg.locator('#big').evaluate('d=>d.open')
        # page still works; dark-mode safe; INR conversion inside expanded view
        pg.click('[data-cur=INR]'); pg.wait_for_timeout(300); pg.locator('[data-id=rev]').click(force=True); pg.wait_for_timeout(800)
        assert '₹45,000' in pg.inner_text('#bigChips'), pg.inner_text('#bigChips')
        pg.screenshot(path=f'/tmp/big_rev_{name}.png'); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
        assert pg.evaluate('document.documentElement.scrollWidth')<=vp['width']
        print(name,'ok errs',errs); ctx.close()
    b.close()
print('ui4 passed')

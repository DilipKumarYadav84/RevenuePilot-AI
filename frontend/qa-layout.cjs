const { chromium } = require('C:/Users/HP/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('node:fs');
(async () => {
  fs.mkdirSync('qa', {recursive:true});
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage();
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  const results=[];
  for (const width of [375,430,768,1024,1366,1440]) {
    await page.setViewportSize({width,height:900});
    await page.goto('http://localhost:5173');
    for (const mode of ['Shopper Journey','Merchant Console','Director Dual-View','Scenario Playbook']) {
      await page.getByRole('tab',{name:mode,exact:true}).click();
      if(mode==='Merchant Console') await page.getByText('Verified Test Revenue',{exact:true}).waitFor();
      await page.waitForTimeout(200);
      const layout = await page.evaluate(() => ({
        pageWidth:document.documentElement.scrollWidth, viewport:innerWidth,
        overflow:[...document.querySelectorAll('main *')].filter(e=>{
          const r=e.getBoundingClientRect(); return r.width>0 && (r.right>innerWidth+1 || r.left< -1);
        }).map(e=>({tag:e.tagName,cls:e.className})).slice(0,12),
      }));
      results.push({width,mode,...layout});
      if([375,1366].includes(width)) await page.screenshot({path:`qa/${mode.split(' ')[0].toLowerCase()}-${width}.png`,fullPage:true});
    }
  }
  fs.writeFileSync('qa/layout-results.json',JSON.stringify({results,errors},null,2));
  console.log(JSON.stringify({checks:results.length,failures:results.filter(r=>r.pageWidth>r.viewport||r.overflow.length),errors},null,2));
  await browser.close();
})();


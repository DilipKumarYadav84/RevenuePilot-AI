const { chromium } = require('C:/Users/HP/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1366,height:900}});
  await page.goto('http://localhost:5173');
  await page.screenshot({path:'qa-before-shopper.png',fullPage:true});
  await page.getByRole('tab',{name:'Director Dual-View'}).click();
  await page.screenshot({path:'qa-before-director.png',fullPage:true});
  await browser.close();
})();

const { chromium } = require('C:/Users/HP/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const readline=require('node:readline');
(async()=>{
  global.browser=await chromium.launch({headless:true});
  global.page=await browser.newPage({viewport:{width:1366,height:900}});
  await page.goto('http://localhost:5173');
  console.log('QA browser ready');
  for await (const line of readline.createInterface({input:process.stdin})) {
    if(line==='exit') {await browser.close();break;}
    try {await new (Object.getPrototypeOf(async function(){}).constructor)(line)();} catch(e){console.log(e.message);}
  }
})();

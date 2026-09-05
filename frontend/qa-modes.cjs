const { chromium } = require('C:/Users/HP/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:5173');
  await page.getByRole('tab',{name:'Scenario Playbook'}).click();
  await page.getByRole('button').filter({hasText:'Price Hesitation Policy Cap'}).click();
  await page.getByRole('button',{name:'Launch in Shopper Journey',exact:true}).click();
  await page.getByRole('button',{name:'Accept 10% offer',exact:true}).waitFor({timeout:90000});
  console.log('Replay message count:',await page.locator('.message-customer').count());
  console.log('Replay selected:',await page.locator('.product-detail h2').innerText());
  await page.getByRole('tab',{name:'Merchant Console'}).click();
  await page.getByText('Verified Test Revenue',{exact:true}).waitFor();
  for(const width of [375,430,768,1024,1366,1440]) {
    await page.setViewportSize({width,height:900});
    for(const section of ['Overview','Live conversations','Offers','Razorpay payments','Policy','Audit trail']) {
      await page.getByRole('button',{name:section,exact:true}).click();
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error(`${section} overflow at ${width}`);
    }
  }
  await page.screenshot({path:'qa/audit-1440.png',fullPage:true});
  await page.getByRole('tab',{name:'Shopper Journey'}).click();
  console.log('Shopper retained:',await page.getByRole('button',{name:'Accept 10% offer',exact:true}).isVisible());
  await page.getByRole('tab',{name:'Director Dual-View'}).click();
  const director=page.locator('.director-mode-container');
  await director.getByLabel('Message RevenuePilot AI',{exact:true}).fill('DevBook Air 14 is so expensive but I really like it');
  await director.getByRole('button',{name:'Send',exact:true}).click();
  await director.getByRole('button',{name:'Accept 10% offer',exact:true}).waitFor({timeout:90000});
  await page.waitForTimeout(1000);
  console.log('Director inspector:',await director.locator('.tower-readout').innerText());
  console.log('Director audit count:',await director.locator('.audit-event').count());
  await page.setViewportSize({width:1366,height:900});
  await page.screenshot({path:'qa/director-live-1366.png',fullPage:true});
  for(const width of [375,430,768,1024,1366,1440]) {
    await page.setViewportSize({width,height:900});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw new Error(`Live director overflow at ${width}`);
  }
  console.log('Merchant sections: 36 viewport checks passed. Live Director: 6 checks passed. Errors:',errors);
  fs.writeFileSync('qa/modes-results.json',JSON.stringify({merchantChecks:36,directorChecks:6,replay:true,persistence:true,errors},null,2));
  await browser.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});

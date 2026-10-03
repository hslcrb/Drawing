import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:256,height:256},deviceScaleFactor:1});
  await page.setContent(`<html><body style="margin:0;background:transparent">${await fs.readFile('assets/icon.svg','utf8')}</body></html>`);
  const png=await page.screenshot({omitBackground:true});await fs.writeFile('assets/icon.png',png);
  const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  await fs.writeFile('assets/icon.ico',Buffer.concat([header,png]));
}finally{await browser.close();}

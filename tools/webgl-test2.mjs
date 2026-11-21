import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 120000,
  args: ['--no-sandbox','--disable-gpu-sandbox','--hide-scrollbars','--user-data-dir=/tmp/dsh-chrome-pptr','--enable-unsafe-swiftshader','--use-angle=metal'],
});
console.log('launched');
const page = await browser.newPage();
await page.setViewport({width: 800, height: 500, deviceScaleFactor: 1});
await page.setContent('<canvas id="c" width="800" height="500"></canvas>');
const info = await page.evaluate(() => {
  const gl = document.getElementById('c').getContext('webgl2');
  if (!gl) return {ok:false};
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  gl.clearColor(0.1,0.3,0.7,1); gl.clear(gl.COLOR_BUFFER_BIT);
  return {ok:true, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown', version: gl.getParameter(gl.VERSION)};
});
console.log(JSON.stringify(info));
await page.screenshot({path: 'tools/test2.png'});
await browser.close();

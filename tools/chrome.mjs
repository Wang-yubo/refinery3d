/**
 * 无头 Chrome 的可执行文件路径与启动参数（macOS 本机 / Linux CI 共用）。
 * 通过 CHROME_PATH 覆盖路径；ANGLE 后端参数只在 macOS 下追加。
 */
export const CHROME = process.env.CHROME_PATH
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const GL_ARGS = process.platform === 'darwin'
  ? ['--enable-unsafe-swiftshader', '--use-angle=metal']
  : ['--enable-unsafe-swiftshader', '--disable-software-rasterizer'];

export const BASE_URL = process.env.SERVE_URL || 'http://127.0.0.1:4321/';

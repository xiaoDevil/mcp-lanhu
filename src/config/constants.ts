// 蓝湖 API 基础 URL
export const BASE_URL = 'https://lanhuapp.com';
export const DDS_BASE_URL = 'https://dds.lanhuapp.com';
export const CDN_URL = 'https://axure-file.lanhuapp.com';

// CSS 无单位属性集合
export const UNITLESS_PROPERTIES = new Set([
  'zIndex',
  'fontWeight',
  'opacity',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
]);

// 设计图通用 CSS
export const COMMON_CSS_FOR_DESIGN = `
body * {
  box-sizing: border-box;
  flex-shrink: 0;
}
body {
  font-family: PingFangSC-Regular, Roboto, Helvetica Neue, Helvetica, Tahoma,
    Arial, PingFang SC-Light, Microsoft YaHei;
}
input {
  background-color: transparent;
  border: 0;
}
button {
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  outline: none;
  background-color: transparent;
}
button:active {
  opacity: 0.6;
}
.flex-col {
  display: flex;
  flex-direction: column;
}
.flex-row {
  display: flex;
  flex-direction: row;
}
.justify-start {
  display: flex;
  justify-content: flex-start;
}
.justify-center {
  display: flex;
  justify-content: center;
}
.justify-end {
  display: flex;
  justify-content: flex-end;
}
.justify-evenly {
  display: flex;
  justify-content: space-evenly;
}
.justify-around {
  display: flex;
  justify-content: space-around;
}
.justify-between {
  display: flex;
  justify-content: space-between;
}
.align-start {
  display: flex;
  align-items: flex-start;
}
.align-center {
  display: flex;
  align-items: center;
}
.align-end {
  display: flex;
  align-items: flex-end;
}
`;

// 默认 User-Agent
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// 东八区偏移量（毫秒）
export const CHINA_TZ_OFFSET = 8 * 60 * 60 * 1000;

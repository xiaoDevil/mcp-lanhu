/** Axure 设计 Schema JSON 节点 */
export interface DesignNode {
  type?: string;
  props?: {
    className?: string;
    text?: string;
    src?: string;
    style?: Record<string, unknown>;
    [key: string]: unknown;
  };
  data?: {
    value?: string;
    [key: string]: unknown;
  };
  style?: Record<string, unknown>;
  children?: DesignNode[];
  loop?: unknown[];
  loopData?: unknown[];
  loopType?: string;
  alignJustify?: {
    justifyContent?: string;
    alignItems?: string;
  };
  [key: string]: unknown;
}

/** Sketch/PSD JSON 结构 */
export interface SketchData {
  type?: string;
  device?: string;
  psdName?: string;
  sliceScale?: number;
  exportScale?: number;
  meta?: {
    host?: { name?: string };
    sliceScale?: number;
    [key: string]: unknown;
  };
  artboard?: {
    frame?: SketchFrame;
    realFrame?: SketchFrame;
    layers?: SketchLayer[];
    [key: string]: unknown;
  };
  board?: {
    width?: number;
    height?: number;
    fill?: { color?: SketchColor };
    layers?: SketchLayer[];
    [key: string]: unknown;
  };
  info?: SketchLayer[];
  assets?: SketchAsset[];
  [key: string]: unknown;
}

export interface SketchFrame {
  x?: number;
  y?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export interface SketchColor {
  red?: number;
  r?: number;
  green?: number;
  g?: number;
  blue?: number;
  b?: number;
  value?: string;
  alpha?: number;
  a?: number;
}

export interface SketchLayer {
  name?: string;
  type?: string;
  visible?: boolean;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  frame?: SketchFrame;
  realFrame?: SketchFrame;
  layers?: SketchLayer[];
  children?: SketchLayer[];
  images?: Record<string, string>;
  textInfo?: Record<string, unknown>;
  text?: { value?: string; style?: Record<string, unknown> };
  fill?: { color?: SketchColor };
  layerEffects?: Record<string, unknown>;
  style?: Record<string, unknown>;
  blendOptions?: Record<string, unknown>;
  path?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SketchAsset {
  id?: string | number;
  name?: string;
  isSlice?: boolean;
  bounds?: Record<string, number>;
  scaleType?: number;
  [key: string]: unknown;
}

/** 图层标注 */
export interface LayerAnnotation {
  name: string;
  type: string;
  css: Record<string, string>;
  text?: string;
  sliceUrl?: string;
}

/**
 * 将蓝湖标注面板的 Objective-C 代码转换为 CSS 属性
 */
export function ocToCss(ocCode: string): string {
  const css: string[] = [];

  // CGRect
  const rect = ocCode.match(
    /CGRectMake\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/
  );
  if (rect) {
    css.push(
      `left:${rect[1]}px;top:${rect[2]}px;width:${rect[3]}px;height:${rect[4]}px`
    );
  }

  // backgroundColor
  for (const pat of ocCode.matchAll(
    /backgroundColor = \[UIColor colorWithRed:([\d]+)\/255\.0 green:([\d]+)\/255\.0 blue:([\d]+)\/255\.0 alpha:([\d.]+)\]/g
  )) {
    css.push(
      `background-color:rgba(${pat[1]},${pat[2]},${pat[3]},${pat[4]})`
    );
  }

  // cornerRadius
  const cornerRadius = ocCode.match(/cornerRadius = ([\d.]+)/);
  if (cornerRadius) {
    css.push(`border-radius:${cornerRadius[1]}px`);
  }

  // shadow
  const shadowColor = ocCode.match(
    /shadowColor = \[UIColor colorWithRed:([\d]+)\/255\.0 green:([\d]+)\/255\.0 blue:([\d]+)\/255\.0 alpha:([\d.]+)\]/
  );
  const shadowOffset = ocCode.match(
    /shadowOffset = CGSizeMake\(([\d.-]+),([\d.-]+)\)/
  );
  const shadowRadius = ocCode.match(/shadowRadius = ([\d.]+)/);
  if (shadowColor && shadowOffset) {
    const blur = shadowRadius ? shadowRadius[1] : '0';
    css.push(
      `box-shadow:${shadowOffset[1]}px ${shadowOffset[2]}px ${blur}px rgba(${shadowColor[1]},${shadowColor[2]},${shadowColor[3]},${shadowColor[4]})`
    );
  }

  // border
  const borderW = ocCode.match(/borderWidth = ([\d.]+)/);
  const borderC = ocCode.match(
    /borderColor = \[UIColor colorWithRed:([\d]+)\/255\.0 green:([\d]+)\/255\.0 blue:([\d]+)\/255\.0 alpha:([\d.]+)\]/
  );
  if (borderW && borderC) {
    css.push(
      `border:${borderW[1]}px solid rgba(${borderC[1]},${borderC[2]},${borderC[3]},${borderC[4]})`
    );
  }

  // font
  if (ocCode.includes('fontWithName:@"')) {
    const font = ocCode.match(/fontWithName:@"([^"]+)" size: ([\d.]+)/);
    if (font) {
      css.push(
        `font-family:"${font[1]}",sans-serif;font-size:${font[2]}px`
      );
    }
  }

  // foreground color
  const fgColor = ocCode.match(
    /ForegroundColorAttributeName: \[UIColor colorWithRed:([\d]+)\/255\.0 green:([\d]+)\/255\.0 blue:([\d]+)\/255\.0 alpha:([\d.]+)\]/
  );
  if (fgColor) {
    css.push(
      `color:rgba(${fgColor[1]},${fgColor[2]},${fgColor[3]},${fgColor[4]})`
    );
  }

  return css.join(';');
}

import { expect } from '@playwright/test';
import sharp from 'sharp';

// A hittable DOM box can still be visually hidden by a pointer-events:none
// sibling. Compare actual browser pixels with this control deliberately hidden.
export async function measureControlPaint(page, control, { hiddenReference = null } = {}) {
  await expect(control).toBeVisible();
  // Read related paint prerequisites in one browser round trip. Repeating
  // independent reads adds trace snapshots without exercising new behavior.
  let layout;
  await expect.poll(async () => {
    layout = await control.evaluate(node => {
      const rect=node.getBoundingClientRect();
      const style=getComputedStyle(document.documentElement);
      return {
        imagesLoaded:[...node.querySelectorAll('img')].every(image => image.complete && image.naturalWidth > 0),
        box:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        safe:Object.fromEntries(['top','right','bottom','left'].map(edge=>[edge,Math.max(0,parseFloat(style.getPropertyValue(`--safe-${edge}`))||0)])),
      };
    });
    return layout.imagesLoaded;
  }).toBe(true);
  const { box, safe } = layout;
  const viewport = page.viewportSize();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box.x).toBeGreaterThanOrEqual(safe.left);
  expect(box.y).toBeGreaterThanOrEqual(safe.top);
  expect(box.x+box.width).toBeLessThanOrEqual(viewport.width-safe.right+1);
  expect(box.y+box.height).toBeLessThanOrEqual(viewport.height-safe.bottom+1);
  await control.click({ trial: true });
  const clip = { x: Math.max(0,box.x), y: Math.max(0,box.y), width: Math.min(box.width,viewport.width-box.x), height: Math.min(box.height,viewport.height-box.y) };
  const visible = await page.screenshot({ clip, scale: 'css', animations: 'disabled' });
  let hidden = hiddenReference;
  if (!hidden) {
    let previous, captureError;
    try {
      previous = await control.evaluate(node => {
        const old={ value: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility') };
        node.style.setProperty('visibility','hidden','important');
        return old;
      });
      hidden = await page.screenshot({ clip, scale: 'css', animations: 'disabled' });
    } catch (error) {
      captureError = error;
      throw error;
    } finally {
      // A timeout can close the page. Cleanup must not replace the capture error.
      if (previous && !page.isClosed()) {
        try {
          await control.evaluate((node,old) => old.value ? node.style.setProperty('visibility',old.value,old.priority) : node.style.removeProperty('visibility'),previous);
        } catch (error) { if (!captureError) throw error; }
      }
    }
  }
  const a=await sharp(visible).ensureAlpha().raw().toBuffer(), b=await sharp(hidden).ensureAlpha().raw().toBuffer();
  expect(a.length).toBe(b.length);
  let changedPixels=0;
  for(let i=0;i<a.length;i+=4) if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>24) changedPixels++;
  return { changedPixels, pixels:a.length/4, visible, hidden, box };
}

export async function expectControlPainted(page, control, testInfo, label, options) {
  const result=await measureControlPaint(page,control,options);
  await testInfo.attach(`${label}-visible`,{body:result.visible,contentType:'image/png'});
  await testInfo.attach(`${label}-hidden-control`,{body:result.hidden,contentType:'image/png'});
  expect(result.changedPixels,`${label} must contribute visible pixels, even if an opaque cover ignores pointer input`).toBeGreaterThan(24);
  return result;
}

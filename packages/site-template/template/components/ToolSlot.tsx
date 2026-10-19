"use client";

/**
 * 编辑器挂载点。新站接入真实工具时替换本文件内容：
 * - 纯浏览器处理的工具用 @microtools/editor-core（照片类）或自建引擎；
 * - 组件必须 `dynamic(..., { ssr: false })` 或保持 "use client"，
 *   避免在 SSR 阶段触碰 canvas / window。
 *
 * 占位期间页面保持 noindex（lib/tool.ts 的 live=false），不会被收录。
 */
export function ToolSlot() {
  return (
    <div className="tool-slot">
      <p>
        <strong>Tool goes here.</strong>
      </p>
      <p>
        Replace <code>components/ToolSlot.tsx</code> with the real editor, then flip{" "}
        <code>live</code> to <code>true</code> in <code>lib/tool.ts</code>.
      </p>
    </div>
  );
}

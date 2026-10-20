/**
 * 工具挂载点。新站把这里换成真实编辑器（优先复用 @/shared/render 的 EditorEngine）。
 *
 * 在工具真正可用之前保持 lib/tool.ts 的 live: false —— 空壳页被索引是最贵的返工。
 */
export function ToolSlot() {
  return (
    <section className="tool-slot" aria-label="Tool">
      <p className="tool-slot__title">Drop the real tool here</p>
      <p>
        Replace <code>src/components/ToolSlot.tsx</code> with the editor engine, then flip{" "}
        <code>live: true</code> in <code>src/lib/tool.ts</code>.
      </p>
      <p className="tool-slot__note">
        Placeholder only — this page stays <code>noindex</code> until the tool works.
      </p>
    </section>
  );
}

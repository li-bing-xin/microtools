import { usePageHead } from "@/lib/head";
import { termsPage } from "@/lib/pages";
import { site } from "@/lib/site";

export function TermsPage() {
  usePageHead(termsPage);

  return (
    <>
      <h1>Terms of Use</h1>
      <p className="lede">
        Short version: {site.name} is a free browser tool provided as-is, and the files you process
        remain yours.
      </p>

      <h2>Use of the service</h2>
      <p>
        You may use the tool for personal or commercial work. You are responsible for the files you
        process and for having the rights to edit them.
      </p>

      <h2>No warranty</h2>
      <p>
        The tool is provided without warranties of any kind. Always keep a copy of the original file;
        results depend on the browser and the input format.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent permitted by law, the operators are not liable for lost data or for damages
        arising from use of the tool.
      </p>

      <h2>Changes</h2>
      <p>
        These terms may be updated as the tool evolves. Continued use after an update means you accept
        the revised terms.
      </p>
    </>
  );
}

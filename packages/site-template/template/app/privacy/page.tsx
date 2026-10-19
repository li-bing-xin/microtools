import { buildPageMetadata } from "@microtools/seo-kit";
import { site } from "@/lib/site";

export const metadata = buildPageMetadata(site, {
  path: "/privacy",
  title: "Privacy — Files Never Leave Your Device",
  description:
    "This site processes files entirely in your browser. No uploads, no accounts, no file storage. Metadata is stripped from every export.",
  live: true,
  image: null,
});

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="lede">Files are processed on your device. Nothing is uploaded.</p>

      <h2>What happens to your file</h2>
      <p>
        When you pick a file, the browser reads it locally and the tool renders the result on a
        canvas in this tab. The file itself is never sent to a server: there is no upload endpoint
        in this product.
      </p>

      <h2>What we do not collect</h2>
      <ul>
        <li>No file contents, file names or thumbnails.</li>
        <li>No accounts, no sign-in, no email capture to use the tool.</li>
        <li>No third-party processing callbacks while you edit.</li>
      </ul>

      <h2>Metadata</h2>
      <p>
        Exported files are re-encoded from scratch, so EXIF and other embedded metadata (including
        GPS coordinates) do not carry over.
      </p>

      <h2>Analytics</h2>
      <p>
        Aggregate traffic measurement may be used to understand which tools are useful. It never
        includes file contents.
      </p>
    </>
  );
}

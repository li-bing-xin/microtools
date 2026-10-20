import { usePageHead } from "@/lib/head";
import { privacyPage } from "@/lib/pages";
import { site } from "@/lib/site";

export function PrivacyPage() {
  usePageHead(privacyPage);

  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="lede">
        {site.name} runs entirely in your browser. This page explains what that means in practice.
      </p>

      <h2>Your files</h2>
      <p>
        Files you open in the tool are processed locally in your browser. No file bytes, previews or
        derived data are uploaded to a server, and nothing is stored after you close the tab.
      </p>

      <h2>What is collected</h2>
      <p>
        The site does not require an account and does not run third-party advertising or tracking
        scripts. If hosting-level logs exist (for example, request logs kept by the CDN), they contain
        standard technical fields such as IP address and user agent, and are used only to operate and
        secure the service.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        No cookies are set for advertising or analytics. Browser storage, if used at all, stays on your
        device and is limited to remembering interface preferences.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the updated text will be published on this page. Questions can be sent
        to the contact address listed on the home page.
      </p>
    </>
  );
}

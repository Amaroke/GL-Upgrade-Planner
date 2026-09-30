import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";

const LINK_CLASSES = "text-white/85 underline underline-offset-2 hover:text-white";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK_CLASSES}>
      {children}
    </a>
  );
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

function LegalNotices() {
  return (
    <div className="flex max-h-[80svh] flex-col gap-5 overflow-y-auto rounded-2xl border border-white/10 bg-black p-6 text-sm leading-relaxed text-white/70">
      <LegalSection title="Credits">
        <p>
          Building, Unit and Star Base data and the images of Drops, Building types and Unit types
          come from the Galaxy Life Wiki, written by its contributors.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            <ExternalLink href="https://galaxylife.wiki.gg/">galaxylife.wiki.gg</ExternalLink>,
            content available under the{" "}
            <ExternalLink href="https://creativecommons.org/licenses/by-sa/4.0">
              Creative Commons Attribution-ShareAlike 4.0 License
            </ExternalLink>
            .
          </li>
          <li>
            <ExternalLink href="https://galaxylife.fandom.com/">galaxylife.fandom.com</ExternalLink>
            , community content available under{" "}
            <ExternalLink href="https://www.fandom.com/licensing">CC-BY-SA</ExternalLink> unless
            otherwise noted.
          </li>
        </ul>
        <p>
          The data has been reorganized and the images resized. They are shared under the same
          license.
        </p>
      </LegalSection>

      <LegalSection title="Not affiliated">
        <p>
          This app is a fan-made companion. It is not affiliated with, endorsed by or sponsored by
          Galaxy Life or its developers. Galaxy Life and its names and images belong to their
          respective owners.
        </p>
      </LegalSection>

      <LegalSection title="Privacy">
        <p>
          Without an account, your Drops, Colonies and Planner settings stay in this browser's local
          storage and are never sent anywhere.
        </p>
        <p>
          With Google sign-in, Firebase Authentication receives your Google account identity (your
          name, email address, profile picture and a unique identifier) and keeps your session in
          this browser. Your Drops, Colonies and Planner settings are then also stored in Google
          Firebase (Cloud Firestore), linked to that identifier and readable only by you. What this
          browser already holds is merged into your account when you sign in.
        </p>
        <p>No analytics, advertising or tracking cookies are used.</p>
        <p>
          To stop using your account, sign out. Nothing more is sent to Firebase and the app keeps
          working from this browser. What was already sent stays in Firebase. Clearing this site's
          data in your browser removes what is stored locally.
        </p>
      </LegalSection>
    </div>
  );
}

export function LegalFooter() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/40">
      <span>Not affiliated with Galaxy Life. Data and images from the Galaxy Life Wiki.</span>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="underline underline-offset-2 transition-colors hover:text-white/80"
      >
        Legal
      </button>
      {isOpen && (
        <Modal label="Legal" onClose={() => setIsOpen(false)} widthClassName="max-w-lg">
          <LegalNotices />
        </Modal>
      )}
    </footer>
  );
}

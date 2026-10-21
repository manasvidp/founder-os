import { Link } from "react-router-dom";

const S = [
  ["What we store", "Your account (name, email, a bcrypt password hash or Google sign-in identity) and the records you create: goals, tasks, projects, events, contacts, interactions, finances, habits, check-ins, notes, reviews, business items, content and uploaded documents with their extracted text."],
  ["How it is isolated", "Every record is tied to your account and every request is checked on the server. Other users cannot read, change, export or delete your records."],
  ["AI processing", "When you use the AI Chief of Staff, summaries or content drafts, the relevant records and document excerpts are sent to Anthropic's Claude API to generate the answer. Anthropic does not use API data to train its models by default. Text inside your documents is treated as data, never as instructions. AI suggestions become records only after you approve them."],
  ["Files", "Uploaded documents are stored privately in the app's own database and are only served through the authenticated API. Deleting a document removes the file, its text and its search entries."],
  ["Email", "Founder OS sends two kinds of email, and only to your own address: password-reset links you ask for, and an optional Sunday \"week ahead\" summary you can switch off in Settings → Automations. Email is delivered by Resend."],
  ["External actions", "Founder OS does not message other people, publish content or move money for you. Calendar, bank and LinkedIn integrations are not connected yet."],
  ["Your controls", "Export all your data as JSON, or delete your account and all its records, from Settings → Data & privacy."],
  ["Contact", "Questions about your data: info.thedecisionoffice@gmail.com."],
];

export default function Privacy() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12" data-testid="privacy-page">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Founder OS</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Privacy & data handling</h1>
      <p className="mt-2 text-sm text-muted-foreground">A plain-language description of how Founder OS handles your data. This is not legal advice; have it reviewed before offering the service commercially.</p>
      <div className="mt-8 space-y-6">{S.map(([h, t]) => <section key={h}><h2 className="text-base font-semibold">{h}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t}</p></section>)}</div>
    </div>
  );
}

import { href } from "../lib/router.js"

/** A short, plain-language overview. The limits matter as much as the guarantees, so both are here. */
export function About() {
  return (
    <>
      <h1>How Nullform works</h1>
      <p>
        Nullform lets a group answer a form anonymously, while making sure that only eligible people can
        answer, and only once.
      </p>
      <p>
        <strong>Only the answers are anonymous.</strong> Registering is not: the site knows which account registered
        for a form, and the owner decides who is eligible. What stays hidden is which registered member sent which answer.
      </p>

      <h2>Two steps that never meet</h2>
      <ol>
        <li>
          <strong>Register (not anonymous).</strong> The form's owner says who is eligible: specific email
          addresses, an email domain, or GitHub users. Eligible people sign in and register. This step needs
          your account, because eligibility has to be checked.
        </li>
        <li>
          <strong>Answer (anonymous).</strong> Registered members answer without signing in. Each answer carries a
          zero-knowledge proof: maths that shows "I am one of the registered members" without showing which one.
        </li>
      </ol>

      <h2>What makes that work</h2>
      <ul>
        <li>
          <strong>Your secret stays in your browser.</strong> When you register, your browser creates a secret and
          derives a one-off identity for that form from it. Only a public fingerprint is sent, and the server never
          stores a link between your account and that fingerprint.
        </li>
        <li>
          <strong>The group is frozen, then public.</strong> When the owner freezes the group, the list of
          fingerprints becomes public and its summary is written to a public blockchain as a timestamp, so the group
          can't be quietly changed afterwards.
        </li>
        <li>
          <strong>Anyone can check it.</strong> Every form has an audit page that re-checks the group and every
          submission in your own browser, without trusting us.
        </li>
        <li>
          <strong>One answer per member.</strong> A proof includes a code that is the same for the same member on
          the same form, and can't be traced back to them. A second answer is rejected.
        </li>
        <li>
          <strong>A pause before answers open.</strong> A delay after the group freezes makes it harder to match
          who registered with who answered by timing.
        </li>
      </ul>

      <h2>What you can rely on</h2>
      <ul>
        <li>An answer reveals only that the sender is <em>some</em> registered member.</li>
        <li>Nobody can answer twice.</li>
        <li>The owner can't secretly change the group once it is frozen.</li>
      </ul>

      <h2>What Nullform does not protect</h2>
      <ul>
        <li>
          <strong>What you write.</strong> Nullform protects <em>who</em> answered, not <em>what</em> was answered.
          The owner reads every answer, and free text can identify you by style or detail.
        </li>
        <li>
          <strong>Network traces.</strong> The hosting providers can see the IP address and time of every request.
          The practical way to be identified is to register and answer from the same address, which anyone with access
          to those logs could match up. Answer from a different network than the one you registered on, or hide your
          address with Tor Browser (the strongest option), a VPN or a proxy. A VPN or proxy only moves that trust to
          whoever runs it.
        </li>
        <li>
          <strong>Small groups.</strong> With only a few members, anonymity is weak. Owners are warned below 20.
        </li>
        <li>
          <strong>Fake members.</strong> An owner could register fake identities. It would show on the audit page
          but isn't prevented. If a form lets "anyone with an account" register, one person can register many times.
        </li>
        <li>
          <strong>A lost secret.</strong> If you clear your browser data without saving your backup, you can no longer
          answer. Save the backup string when you register.
        </li>
        <li>
          <strong>Trusting this site.</strong> The code runs in your browser, so a compromised host could serve
          altered code. The code is open source (MIT licensed).
        </li>
        <li>
          <strong>Review.</strong> This is a proof of concept and has not been independently audited.
        </li>
      </ul>

      <h2>Built with</h2>
      <p className="muted">
        The Semaphore protocol (zero-knowledge group membership, Groth16 proofs), Vercel, Supabase, and Ethereum's
        Sepolia test network for timestamps.
      </p>

      <p><a href={href("/")}>Back to the start</a> · <a href={href("/dashboard")}>My forms</a></p>
    </>
  )
}

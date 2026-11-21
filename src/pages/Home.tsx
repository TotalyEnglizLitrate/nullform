import { href } from "../lib/router.js"

export function Home() {
  return (
    <>
      <h1>Authenticated, Anonymous forms</h1>
      <p>
        Only eligible, signed-in people can <strong>register</strong> for a form. Answers are then submitted
        <strong> without signing in</strong>, with a zero-knowledge proof that the sender is one of the registered
        members, and not which one.
      </p>
      <p><a href={href("/about")}>Tell me more</a></p>
      <ol>
        <li>The owner creates a form and decides who is eligible.</li>
        <li>Eligible people sign in and register. Their browser creates a secret that never leaves it.</li>
        <li>The owner freezes the group. Its list and root become public.</li>
        <li>Members answer anonymously. Each member can answer once.</li>
      </ol>
      <p className="muted">
        Nullform protects who answered, not what was answered: the owner reads every answer.
      </p>
      <p><a href={href("/new")}>Create a form</a> · <a href={href("/dashboard")}>My forms</a></p>
    </>
  )
}

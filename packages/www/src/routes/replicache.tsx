import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/replicache')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/replicache"!</div>
}

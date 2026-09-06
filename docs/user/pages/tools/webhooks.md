# Webhooks

## Purpose

Webhook Configuration — manage outbound webhooks that notify an external endpoint (generic HTTP, Slack, or Discord) when specific VM and backup events occur.

## When to use it

- To wire VM lifecycle events (started, stopped, created, deleted) or backup results (completed, failed) into Slack, Discord, or your own HTTP endpoint
- To verify a webhook endpoint is reachable and correctly configured before relying on it
- To audit which webhooks exist, what events they listen for, and whether they're enabled

## How to get there

- Route / id: `/webhooks`
- Nav: **Tools → Webhooks** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Add Webhook** opens a form: destination URL, delivery type (generic / Slack / Discord), and a multi-select of events (`vm.started`, `vm.stopped`, `vm.created`, `vm.deleted`, `backup.completed`, `backup.failed`). A URL and at least one event are required — validation errors show inline before it will save.
2. Saving posts the new webhook (`POST /api/webhooks`, created enabled by default) and refreshes the list.
3. Each configured webhook shows its URL (with a copy button), a type badge, its subscribed event tags, and an enabled/disabled indicator.
4. **Test** sends a one-off test delivery (`POST /api/webhooks/test`) and reports delivered/failed inline on that webhook.
5. The trash icon asks for confirmation, then deletes the webhook (`DELETE /api/webhooks/{id}`).
6. Use the refresh control in the header to re-fetch the webhook list.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)

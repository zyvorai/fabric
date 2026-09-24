# Brokered browser

- Chromium driven for a11y tree / allowed CDP paths only — not raw DOM + JS dump.
- Per-site disposable profiles: new origin → fresh profile; bank profile never
  loads untrusted JS origins.
- Cockpit can take over the browser in one click.

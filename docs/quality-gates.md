# Frontend Quality Gates

The normal frontend CI verifies the following before deployment:

- lint, unit tests, production dependency audit, and production build;
- initial and deferred JavaScript bundle budgets;
- all core routes on LUNC and LUNA;
- representative desktop and mobile routes in light and dark themes;
- serious and critical WCAG 2 A/AA findings;
- horizontal overflow and header-control overlap checks;
- wallet runtime deferral, mobile handoff, failure recovery, and long labels.

The mobile wallet runtime remains outside the initial bundle. Opening the
connect flow preloads it only when Keplr Mobile is available, reducing the wait
after the user chooses that connector without taxing ordinary page loads.

Production clients report FCP, LCP, CLS, INP, and TTFB to the BURITO API. The
report contains no wallet address or query string and is aggregated for a
30-day operational view.

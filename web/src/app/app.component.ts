import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar class="app-bar">
      <div class="app-bar__inner">
        <a class="brand" routerLink="/employees">Payscope</a>
        <nav>
          <a mat-button routerLink="/employees" routerLinkActive="active">Employees</a>
          <a mat-button routerLink="/insights" routerLinkActive="active">Insights</a>
        </nav>
      </div>
    </mat-toolbar>
    <main><router-outlet /></main>
  `,
  styles: [`
    :host { display: block; min-height: 100%; }

    .app-bar {
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      // The bar spans the viewport so its hairline does; its CONTENT is
      // constrained by the inner element below. Material's own 16px padding
      // would otherwise sit the brand hard against the viewport edge while the
      // page title below it starts at the centred gutter - the two never line up.
      padding: 0;
    }

    // Same max-width and gutter as <main>, so the brand sits directly above the
    // page title rather than to the left of it.
    .app-bar__inner {
      display: flex;
      align-items: center;
      gap: var(--space-6);
      width: 100%;
      max-width: var(--page-max);
      margin: 0 auto;
      padding: 0 var(--gutter);
    }

    .brand {
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--mat-sys-on-surface);
      text-decoration: none;
      // The wordmark is the standard "home" affordance; here home is the
      // employee list, which is also where the empty path redirects.
      cursor: pointer;

      &:hover {
        color: var(--mat-sys-primary);
      }
    }

    nav {
      display: flex;
      gap: var(--space-2);
      height: 100%;
    }

    nav a {
      color: var(--mat-sys-on-surface-variant);
      border-radius: var(--mat-sys-corner-full, 999px);
    }

    // A clear but quiet active state: a filled pill in the primary container,
    // not a coloured underline that fights the hairline below the bar.
    nav a.active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    main {
      padding: var(--space-6) var(--gutter);
      max-width: var(--page-max);
      margin: 0 auto;
    }
  `],
})
export class AppComponent {}

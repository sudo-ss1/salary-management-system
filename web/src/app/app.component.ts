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
      <span class="brand">Payscope</span>
      <nav>
        <a mat-button routerLink="/employees" routerLinkActive="active">Employees</a>
        <a mat-button routerLink="/insights" routerLinkActive="active">Insights</a>
      </nav>
    </mat-toolbar>
    <main><router-outlet /></main>
  `,
  styles: [`
    :host { display: block; min-height: 100%; }

    .app-bar {
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      gap: var(--space-6);
    }

    .brand {
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--mat-sys-on-surface);
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

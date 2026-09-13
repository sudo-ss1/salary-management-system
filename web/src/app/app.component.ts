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
    <mat-toolbar color="primary">
      <span class="brand">Payscope</span>
      <nav>
        <a mat-button routerLink="/employees" routerLinkActive="active">Employees</a>
        <a mat-button routerLink="/insights" routerLinkActive="active">Insights</a>
      </nav>
    </mat-toolbar>
    <main><router-outlet /></main>
  `,
  styles: [`
    .brand { font-weight: 600; margin-right: 2rem; }
    main { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
  `],
})
export class AppComponent {}

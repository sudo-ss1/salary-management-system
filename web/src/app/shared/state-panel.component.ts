import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RequestState } from './request-state';

/**
 * Renders the three non-ready states and nothing else. The parent renders its
 * own content when there is data, so this never needs generic projection.
 */
@Component({
  selector: 'app-state-panel',
  standalone: true,
  imports: [MatProgressSpinnerModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().status === 'loading') {
      <div class="panel"><mat-progress-spinner mode="indeterminate" diameter="40" /></div>
    } @else if (state().status === 'error') {
      <div class="panel error" role="alert">
        <mat-icon>error_outline</mat-icon>
        <p>{{ errorDetail() }}</p>
        <button mat-stroked-button (click)="retry.emit()">Try again</button>
      </div>
    } @else if (isEmpty()) {
      <div class="panel empty"><mat-icon>inbox</mat-icon><p>{{ emptyMessage() }}</p></div>
    }
  `,
  styles: [`
    .panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      padding: var(--space-7) var(--space-4);
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .panel mat-icon {
      font-size: 2.25rem;
      width: 2.25rem;
      height: 2.25rem;
      opacity: .6;
    }

    .error { color: var(--mat-sys-error); }
    .error mat-icon { opacity: .8; }

    p { margin: 0; text-align: center; max-width: 32rem; }
  `],
})
export class StatePanelComponent {
  readonly state = input.required<RequestState<unknown>>();
  readonly isEmpty = input(false);
  readonly emptyMessage = input('Nothing to show');
  readonly retry = output<void>();

  errorDetail(): string {
    const state = this.state();
    return state.status === 'error' ? state.error.detail : '';
  }
}

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
    .panel { display: flex; flex-direction: column; align-items: center; gap: .75rem; padding: 3rem 1rem; }
    .error { color: var(--mat-sys-error, #b3261e); }
    p { margin: 0; text-align: center; }
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

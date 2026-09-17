import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

/**
 * A small "i" that opens a short explanation of the figure beside it.
 *
 * Click rather than hover: a tooltip is invisible on touch and to anyone who
 * does not know there is something to hover over, and the reader who needs
 * this most is the one who does not already know the term exists.
 *
 * MatMenu rather than a hand-rolled panel because it already handles focus
 * return, Escape, click-outside and staying on screen near a viewport edge -
 * all of which a bare toggled <div> gets wrong by default.
 */
@Component({
  selector: 'app-info-button',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button mat-icon-button type="button" class="info-button"
            [matMenuTriggerFor]="menu" [attr.aria-label]="label()">
      <mat-icon>info_outline</mat-icon>
    </button>

    <mat-menu #menu="matMenu">
      <!-- Stop propagation so selecting text inside the panel does not
           dismiss it; a menu closes on any click by default. -->
      <div class="info-panel" (click)="$event.stopPropagation()">
        <ng-content />
      </div>
    </mat-menu>
  `,
  styles: [`
    // Sized against the text it sits beside, not against Material's default
    // 40px touch target - a circle wider than the label's cap height reads as
    // a control in its own right rather than an annotation on the label.
    .info-button {
      width: 1.5rem;
      height: 1.5rem;
      line-height: 1.5rem;
      padding: 0;
      color: var(--mat-sys-on-surface-variant);
      vertical-align: middle;
    }
    .info-button mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      line-height: 1rem;
    }
  `],
})
export class InfoButtonComponent {
  /** Names the figure being explained, so the control is not just "button". */
  readonly label = input<string>('More information');
}

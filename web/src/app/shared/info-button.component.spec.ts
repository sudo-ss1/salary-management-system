import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { InfoButtonComponent } from './info-button.component';

@Component({
  standalone: true,
  imports: [InfoButtonComponent],
  template: `<app-info-button label="What compa-ratio means">
    <p>Pay against the midpoint of the band.</p>
  </app-info-button>`,
})
class HostComponent {}

describe('InfoButtonComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideNoopAnimations()],
    });
  });

  it('keeps the explanation closed until the button is clicked', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    // The panel lives in an overlay, so absence is proven against the whole
    // document rather than this component's own element.
    expect(document.body.textContent).not.toContain('midpoint of the band');
  });

  it('opens the explanation on click', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();

    expect(document.body.textContent).toContain('Pay against the midpoint of the band.');
  });

  it('names what it explains, so it is not announced as an unlabelled button', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button').getAttribute('aria-label'))
      .toBe('What compa-ratio means');
  });
});

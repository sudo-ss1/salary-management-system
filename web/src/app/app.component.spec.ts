import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('names the application in the toolbar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Payscope');
  });

  it('offers navigation to both user jobs', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('a[routerLink]'));
    expect(links.map(a => a.getAttribute('routerLink'))).toEqual(
      expect.arrayContaining(['/employees', '/insights']),
    );
  });
});

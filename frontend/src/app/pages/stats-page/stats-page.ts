import { Component, OnInit, signal, inject } from '@angular/core';
import { WeatherService } from '../../services/weather.service';
import { Stats } from '../../models/weather';
import { KpiCardComponent } from '../../components/kpi-card/kpi-card';
import { LoadingComponent } from '../../components/state/loading';
import { ErrorComponent } from '../../components/state/error';
import { formatDateDe } from '../../utils/berlin-date';

@Component({
  selector: 'app-stats-page',
  standalone: true,
  imports: [KpiCardComponent, LoadingComponent, ErrorComponent],
  templateUrl: './stats-page.html',
})
export class StatsPageComponent implements OnInit {
  private weather = inject(WeatherService);

  readonly formatDate = formatDateDe;

  stats = signal<Stats | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.weather.getStats().subscribe({
      next: s => { this.stats.set(s); this.loading.set(false); },
      error: () => { this.error.set('Fehler beim Laden der Statistiken.'); this.loading.set(false); }
    });
  }
}

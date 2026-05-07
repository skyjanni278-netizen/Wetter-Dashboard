import { Component, OnInit, signal, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { WeatherService } from '../../services/weather.service';
import { Stats } from '../../models/weather';

@Component({
  selector: 'app-stats-page',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './stats-page.html',
  styleUrl: './stats-page.css'
})
export class StatsPageComponent implements OnInit {
  private weather = inject(WeatherService);

  stats = signal<Stats | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.weather.getStats().subscribe({
      next: s => { this.stats.set(s); this.loading.set(false); },
      error: () => { this.error.set('Fehler beim Laden der Statistiken.'); this.loading.set(false); }
    });
  }

  formatDate(date: string): string {
    const [y, m, d] = date.split('-');
    return `${d}.${m}.${y}`;
  }
}

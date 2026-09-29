import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-outer-layout',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './outer-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./outer-layout.scss']
})
export class OuterLayout implements OnInit {
  ngOnInit(): void {
    document.documentElement.dataset['theme'] = 'dark';
  }
}

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DlShellComponent } from './shell/dl-shell.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ImportComponent } from './import/import.component';
import { TrackingComponent } from './tracking/tracking.component';
import { HistoryComponent } from './history/history.component';

const routes: Routes = [
  {
    path: '',
    component: DlShellComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'master', component: ImportComponent },
      { path: 'import', component: TrackingComponent },
      { path: 'tracking', redirectTo: 'tracking/DL1', pathMatch: 'full' },
      { path: 'tracking/:type', component: TrackingComponent },
      { path: 'history', component: HistoryComponent },
      { path: 'references', component: ImportComponent },
    ],
  },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class DlMonitoringRoutingModule { }

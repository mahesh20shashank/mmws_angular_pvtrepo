import { NgModule } from '@angular/core';
import { DlMonitoringRoutingModule } from './dl-monitoring-routing.module';
import { DlShellComponent } from './shell/dl-shell.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ImportComponent } from './import/import.component';
import { TrackingComponent } from './tracking/tracking.component';
import { HistoryComponent } from './history/history.component';

@NgModule({
  imports: [DlShellComponent, DashboardComponent, ImportComponent, TrackingComponent, HistoryComponent, DlMonitoringRoutingModule]
})
export class DlMonitoringModule {}

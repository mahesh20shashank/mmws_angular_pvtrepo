export interface SlipLimit {
  gt_name: string;
  delta_n_lpc: number; // LPC rpm delta limit
  delta_t_ext: number; // Exhaust temp delta limit (°C)
  delta_p_air: number; // Air pressure delta limit (bar)
}

// Dummy OEM reference-graph constants per GT — stand-in for the real regression curves
// built from OEM datapoints. Reference temp (K) / pressure (bar) is the condition the
// OEM graph was plotted at; recorded readings are standardized back to it before comparing.
export interface GtGraphConstants {
  graphTempK: number;
  graphPressureBar: number;
  lpcSlope: number;
  lpcIntercept: number;
  airSlope: number;
  airIntercept: number;
  extSlope: number;
  extIntercept: number;
  gtgExtSlope: number;
  gtgExtIntercept: number;
}

export const GT_NAMES = ['GT 1 (P)', 'GT 2 (S)', 'GTG 1', 'GTG 2'];

export const GT_GRAPH_CONSTANTS: Record<string, GtGraphConstants> = {
  'GT 1 (P)': { graphTempK: 298, graphPressureBar: 1.0, lpcSlope: 0.9, lpcIntercept: 50, airSlope: 0.05, airIntercept: 2, extSlope: 0.3, extIntercept: 200, gtgExtSlope: 0.4, gtgExtIntercept: 250 },
  'GT 2 (S)': { graphTempK: 298, graphPressureBar: 1.0, lpcSlope: 0.88, lpcIntercept: 52, airSlope: 0.048, airIntercept: 2.1, extSlope: 0.29, extIntercept: 205, gtgExtSlope: 0.39, gtgExtIntercept: 252 },
  'GTG 1': { graphTempK: 298, graphPressureBar: 1.0, lpcSlope: 0.85, lpcIntercept: 55, airSlope: 0.045, airIntercept: 2.2, extSlope: 0.31, extIntercept: 195, gtgExtSlope: 0.42, gtgExtIntercept: 240 },
  'GTG 2': { graphTempK: 298, graphPressureBar: 1.0, lpcSlope: 0.86, lpcIntercept: 54, airSlope: 0.046, airIntercept: 2.15, extSlope: 0.305, extIntercept: 198, gtgExtSlope: 0.41, gtgExtIntercept: 243 },
};

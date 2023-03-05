import sourceMapSupport from 'source-map-support';
import '@js-joda/timezone/dist/js-joda-timezone-10-year-range';

sourceMapSupport.install();

export { default as handler } from './update';
export { default as getStats } from './stats';

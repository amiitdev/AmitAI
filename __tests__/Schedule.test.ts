import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetScheduleCache,
  addSchedule,
  describe as describeSchedule,
  loadSchedules,
  nextCron,
  nextRun,
  parseWhen,
  removeSchedule,
  repeatMs,
  Schedule,
  setScheduleEnabled,
} from '../src/lib/schedules';

// Sunday 25 Oct 2026, 06:30 local — "today at 8" is still ahead of us.
const NOW = new Date(2026, 9, 25, 6, 30, 0, 0).getTime();

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetScheduleCache();
});

describe('parseWhen — the phrasings people actually type', () => {
  test('every day at 8 am', () => {
    const p = parseWhen('tell me the weather every day at 8 am', NOW);
    expect(p.ok).toBe(true);
    expect(p.repeat).toBe('daily');
    expect(p.hour).toBe(8);
    expect(p.minute).toBe(0);
    expect(new Date(p.next!).getHours()).toBe(8);
    expect(new Date(p.next!).getDate()).toBe(25);
  });

  test('daily 07:30 (24h clock)', () => {
    const p = parseWhen('daily 07:30', NOW);
    expect(p.ok).toBe(true);
    expect(p.repeat).toBe('daily');
    expect([p.hour, p.minute]).toEqual([7, 30]);
  });

  test('every monday at 9pm', () => {
    const p = parseWhen('every monday at 9pm', NOW);
    expect(p.repeat).toBe('weekly');
    expect(p.weekday).toBe(1);
    expect(p.hour).toBe(21);
    const next = new Date(p.next!);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(26); // tomorrow
  });

  test('weekdays at 7:30 becomes a Mon-Fri cron', () => {
    const p = parseWhen('weekdays at 7:30', NOW);
    expect(p.repeat).toBe('cron');
    expect(p.cron).toBe('30 7 * * 1-5');
    expect(new Date(p.next!).getDay()).toBe(1);
  });

  test('every 2 hours', () => {
    const p = parseWhen('check the news every 2 hours', NOW);
    expect(p.repeat).toBe('hourly');
    expect(p.everyHours).toBe(2);
    expect(new Date(p.next!).getHours()).toBe(8);
  });

  test('tomorrow at 7pm is a one-off', () => {
    const p = parseWhen('tomorrow at 7pm', NOW);
    expect(p.repeat).toBe('once');
    const next = new Date(p.next!);
    expect(next.getDate()).toBe(26);
    expect(next.getHours()).toBe(19);
  });

  test('a bare weekday means the next such day', () => {
    const p = parseWhen('monday at 9am', NOW);
    expect(p.repeat).toBe('once');
    expect(new Date(p.next!).getDay()).toBe(1);
  });

  test('a raw five-field cron expression', () => {
    const p = parseWhen('30 7 * * 1-5', NOW);
    expect(p.repeat).toBe('cron');
    expect(p.cron).toBe('30 7 * * 1-5');
    expect(p.next).toBe(new Date(2026, 9, 26, 7, 30).getTime());
  });

  test('nonsense is rejected with a usable example', () => {
    const p = parseWhen('banana', NOW);
    expect(p.ok).toBe(false);
    expect(p.error).toMatch(/every day at 8 am/);
  });
});

describe('cron maths', () => {
  test('next 08:00 today', () => {
    expect(nextCron('0 8 * * *', NOW)).toBe(new Date(2026, 9, 25, 8, 0).getTime());
  });

  test('first of the month', () => {
    expect(nextCron('0 8 1 * *', NOW)).toBe(new Date(2026, 10, 1, 8, 0).getTime());
  });

  test('every 15 minutes', () => {
    expect(nextCron('*/15 * * * *', NOW)).toBe(new Date(2026, 9, 25, 6, 45).getTime());
  });

  test('invalid field count returns null', () => {
    expect(nextCron('0 8 * *', NOW)).toBeNull();
    expect(nextCron('99 8 * * *', NOW)).toBeNull();
  });
});

describe('nextRun', () => {
  const daily: Schedule = {
    id: 'a',
    title: 'Weather',
    prompt: 'weather?',
    when: 'every day at 8 am',
    repeat: 'daily',
    hour: 8,
    minute: 0,
    enabled: true,
    createdAt: NOW,
  };

  test('rolls to tomorrow once the time has passed', () => {
    const later = new Date(2026, 9, 25, 9, 0).getTime();
    expect(nextRun(daily, later)).toBe(new Date(2026, 9, 26, 8, 0).getTime());
  });

  test('a paused job never runs', () => {
    expect(nextRun({ ...daily, enabled: false }, NOW)).toBeNull();
  });

  test('weekly waits a full week after the slot', () => {
    const weekly: Schedule = {
      ...daily,
      repeat: 'weekly',
      weekday: 1,
      title: 'Monday plan',
    };
    const mondayEvening = new Date(2026, 9, 26, 22, 0).getTime();
    expect(nextRun(weekly, mondayEvening)).toBe(new Date(2026, 10, 2, 8, 0).getTime());
  });

  test('fallback intervals match the repeat', () => {
    expect(repeatMs(daily)).toBe(86_400_000);
    expect(repeatMs({ ...daily, repeat: 'weekly', weekday: 1 })).toBe(7 * 86_400_000);
    expect(repeatMs({ ...daily, repeat: 'hourly', everyHours: 3 })).toBe(3 * 3_600_000);
    expect(repeatMs({ ...daily, repeat: 'once', at: NOW })).toBe(0);
  });
});

describe('describe', () => {
  test('reads like a sentence', () => {
    expect(
      describeSchedule({
        id: 'x',
        title: 't',
        prompt: 'p',
        when: '',
        repeat: 'daily',
        hour: 8,
        minute: 5,
        enabled: true,
        createdAt: 0,
      }),
    ).toBe('every day at 08:05');
    expect(
      describeSchedule({
        id: 'x',
        title: 't',
        prompt: 'p',
        when: '',
        repeat: 'weekly',
        hour: 21,
        minute: 0,
        weekday: 1,
        enabled: true,
        createdAt: 0,
      }),
    ).toBe('every Monday at 21:00');
    expect(
      describeSchedule({
        id: 'x',
        title: 't',
        prompt: 'p',
        when: '',
        repeat: 'cron',
        hour: 7,
        minute: 30,
        cron: '30 7 * * 1-5',
        enabled: true,
        createdAt: 0,
      }),
    ).toBe('cron 30 7 * * 1-5');
  });
});

describe('storage', () => {
  test('add → list → pause → delete', async () => {
    const parsed = parseWhen('every day at 8 am', NOW);
    const s = await addSchedule({
      title: 'Morning weather',
      prompt: 'weather in Nagpur',
      when: 'every day at 8 am',
      parsed,
      now: NOW,
    });
    expect(s.nextAt).toBe(new Date(2026, 9, 25, 8, 0).getTime());

    let all = await loadSchedules();
    expect(all).toHaveLength(1);

    await setScheduleEnabled(s.id, false);
    all = await loadSchedules();
    expect(all[0].enabled).toBe(false);
    expect(all[0].nextAt).toBeUndefined();

    await removeSchedule(s.id);
    expect(await loadSchedules()).toHaveLength(0);
  });
});

// Ticket L2-05 : logique d'affichage de la dernière mesure (sans interface).
import { ageOf, dayLabel, greetingKey } from '../latest';

// 10 octobre 2026, 09:17, heure LOCALE du téléphone.
const NOW = new Date(2026, 9, 10, 9, 17);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

describe('jour de la mesure', () => {
  it('aujourd’hui, hier, avant : jours du calendrier (pas des tranches de 24 h)', () => {
    expect(dayLabel(at(10, 0, 5), NOW)).toBe('today');
    expect(dayLabel(at(9, 23, 50), NOW)).toBe('yesterday'); // 9 h 27 plus tôt, mais hier
    expect(dayLabel(at(9, 0, 0), NOW)).toBe('yesterday');
    expect(dayLabel(at(8, 23, 59), NOW)).toBe('earlier');
  });

  it('mesure un peu dans le futur (horloge en avance) : aujourd’hui', () => {
    expect(dayLabel(at(10, 9, 20), NOW)).toBe('today');
  });
});

describe('ancienneté', () => {
  it('à l’instant, minutes, heures', () => {
    expect(ageOf(at(10, 9, 17), NOW)).toEqual({ key: 'justNow' });
    expect(ageOf(at(10, 9, 20), NOW)).toEqual({ key: 'justNow' }); // futur toléré
    expect(ageOf(at(10, 9, 16), NOW)).toEqual({ key: 'minutes', count: 1 });
    expect(ageOf(at(10, 8, 18), NOW)).toEqual({ key: 'minutes', count: 59 });
    expect(ageOf(at(10, 8, 17), NOW)).toEqual({ key: 'hours', count: 1 });
    expect(ageOf(at(9, 9, 18), NOW)).toEqual({ key: 'hours', count: 23 });
  });

  it('jours : comptés comme le calendrier', () => {
    expect(ageOf(at(9, 9, 17), NOW)).toEqual({ key: 'days', count: 1 });
    expect(ageOf(at(7, 22, 0), NOW)).toEqual({ key: 'days', count: 3 });
  });
});

describe('salutation', () => {
  it('bonjour de 5 h à 18 h, bonsoir ensuite et la nuit', () => {
    expect(greetingKey(at(10, 5, 0))).toBe('morning');
    expect(greetingKey(at(10, 17, 59))).toBe('morning');
    expect(greetingKey(at(10, 18, 0))).toBe('evening');
    expect(greetingKey(at(10, 2, 0))).toBe('evening');
  });
});

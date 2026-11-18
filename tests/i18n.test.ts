import { describe, expect, it } from 'vitest';
import { JA, PATTERNS, translate } from '../src/i18n/ja';

describe('Japanese interface text', () => {
  it('has a Japanese value for every key, and no key that translates to itself', () => {
    for (const [en, ja] of Object.entries(JA)) {
      expect(ja.trim(), en).not.toBe('');
      expect(ja, en).not.toBe(en);
    }
  });

  it.each([
    ['Today', '今日'],
    ['Show answer', '答えを見る'],
    ['Quick session · 5 min or 20 cards', 'クイック学習 · 5分または20枚'],
    ['4:59 left · 1/20', '残り 4:59 · 1/20'],
    ['<1m', '1分未満'],
    ['9d', '9日'],
    ['2.5mo', '2.5か月'],
    ['Saved 承る.', '「承る」を保存しました。'],
    ['Saved 按分 to the Inbox — add a meaning when you have a minute.', '「按分」を受信箱に保存しました。時間のあるときに意味を入れてください。'],
    ['Added 84 cards to Modern slang. They enter study at your new-card limit.', '「最近のスラング」に84枚追加しました。1日の新規カード数に沿って学習に入ります。'],
    ['My cards · 2', 'マイカード · 2'],
    ['Slang · 1', 'スラング · 1'],
    ['My own deck · 3', 'My own deck · 3'],
    ['Last backed up 3 days ago (Downloads).', '最終バックアップ：3日前（Downloads）。'],
    ['Installed: 219,127 entries, 11/17/2026. Works offline.', 'インストール済み：219127語、11/17/2026。オフラインで使えます。'],
    ['3 entries labelled Slang, common words first.', '「スラング」のラベル付き 3件（常用語から）。'],
    ['Not prepared yet. It comes with the app (219,127 entries); preparing it needs no connection.', '未準備。辞書はアプリに含まれています（219127語）。準備に通信は不要です。'],
    ['Preparing… 2,000 entries of 219,127.', '準備中… 219127語中2000語。'],
    ['The backup was not saved (Saving was cancelled). Try again.', 'バックアップは保存されませんでした（Saving was cancelled）。もう一度お試しください。'],
    ['Inbox: 2 cards need a reading or meaning before they can be studied.', '受信箱：読みか意味が未入力のカードが2枚あります。入力すると学習できます。'],
  ])('%s → %s', (en, ja) => {
    expect(translate(en)).toBe(ja);
  });

  it('leaves unknown text and already-Japanese text alone', () => {
    expect(translate('to receive (an order)')).toBeNull();
    expect(translate('今日')).toBeNull();
  });

  it('never lets a pattern match its own output (that would loop)', () => {
    for (const ja of Object.values(JA)) for (const [re] of PATTERNS) expect(re.test(ja), ja).toBe(false);
  });
});

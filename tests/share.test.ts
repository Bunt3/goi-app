import { describe, expect, it } from 'vitest';
import { readAppShare, readShare } from '../src/share';

const p = (o: Record<string, string>) => new URLSearchParams(o);

describe('text shared from another app', () => {
  it('takes the selected text, and the page and site as the source', () => {
    expect(readShare(p({ title: '日経新聞', text: '稟議を通すには根回しが欠かせない。', url: 'https://www.nikkei.com/article/1' }))).toEqual({
      text: '稟議を通すには根回しが欠かせない。',
      source: '日経新聞 · nikkei.com',
      url: 'https://www.nikkei.com/article/1',
    });
  });

  it('moves a link out of the text into the source', () => {
    const s = readShare(p({ text: '来週の会議はリスケになりました https://example.com/x' }))!;
    expect(s.text).toBe('来週の会議はリスケになりました');
    expect(s.source).toBe('example.com');
  });

  it('uses a Japanese title when only a page was shared', () => {
    expect(readShare(p({ title: '新語・流行語大賞が発表', url: 'https://news.example.jp/a' }))!.text).toBe('新語・流行語大賞が発表');
    expect(readShare(p({ title: 'Some English page', url: 'https://example.com' }))!.text).toBe('');
  });

  it('ignores an empty share and survives a bad link', () => {
    expect(readShare(p({}))).toBeNull();
    expect(readShare(p({ text: 'メモ', url: 'not a url' }))!.source).toBe('shared');
  });

  it('names the sending app when Android hands text to the APK', () => {
    // Text-selection menu in LINE: just the selection.
    expect(readAppShare({ text: '了解です、なるはやで対応します', subject: '', app: 'LINE' })).toEqual({
      text: '了解です、なるはやで対応します',
      source: 'LINE',
      url: '',
    });
    // A browser sharing a selection with the page link: the page names the source, not the browser.
    expect(readAppShare({ text: '根回しが欠かせない。 https://www.nikkei.com/a', subject: '日経新聞', app: 'Chrome' })!.source).toBe('日経新聞 · nikkei.com');
    // Android didn't say who sent it.
    expect(readAppShare({ text: '少々お待ちください', subject: '', app: '' })!.source).toBe('shared');
    expect(readAppShare({ text: '', subject: '', app: 'LINE' })).toBeNull();
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatchers, passFilter } from '../scripts/lib/pipeline.js';

const matchers = makeMatchers({
  city_keywords: ['manchester city', '#mcfc'],
  transfer_keywords: ['transfer', 'sign', 'deal', 'bid', 'talks'],
  hot_players: ['Bouaddi'],
  content_policy: {
    exclude_history: ['#onthisday', 'on this day', '#otd'],
    exclude_women: ['#mcwfc', 'man city women', "women's super league", 'wsl', '女足'],
    current_men: ['Rodri', 'Erling Haaland', 'Nathan Aké', 'Enzo Maresca'],
  },
});

test('全局过滤历史上的今天和女足消息', () => {
  assert.equal(passFilter('none', '#OnThisDay: Kolarov left #ManCity in 2017', matchers), false);
  assert.equal(passFilter('none', 'Man City Women announce a new WSL signing', matchers), false);
  assert.equal(passFilter('none', '曼城女足公布新赛季赛程', matchers), false);
});

test('City Xtra 模式保留现役男足和转会消息', () => {
  assert.equal(passFilter('current+transfer', 'Rodri returns to training', matchers), true);
  assert.equal(passFilter('current+transfer', 'Manchester City are in talks to sign Bouaddi', matchers), true);
  assert.equal(passFilter('current+transfer', 'The Boss. 🇮🇹', matchers), false);
});

test('短球员名和 WSL 使用整词匹配', () => {
  assert.equal(passFilter('current+transfer', 'Nathan Ake is fit again', matchers), true);
  assert.equal(passFilter('none', 'A newsletter update', matchers), true);
});

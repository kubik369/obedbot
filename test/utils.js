import {expect} from 'chai';
import {describe, it} from 'mocha';

import {stripMention, isObedbotMentioned, isChannelPublic, alreadyReacted, isOrder} from '../src/utils';
import config from '../config';

const botHandle = `<@${config.slack.botId}>`;

describe('Utils', () => {
  describe('stripMention', () => {
    it('should delete \'@obedbot\' from the order message', () => {
      const inputs = [
        `${botHandle} without colon`,
        `${botHandle}: with colon`,
      ];
      const expectedOutputs = [
        'without colon',
        'with colon',
      ];

      const outputs = inputs.map((input) => stripMention(input));

      expect(outputs).to.eql(expectedOutputs);
    });
  });

  describe('isObedbotMentioned', () => {
    it('should identify obedbot', () => {
      const inputs = [
        `${botHandle} without colon`,
        `${botHandle}: with colon`,
      ];

      const expectedOutputs = [true, true];

      const outputs = inputs.map((input) => isObedbotMentioned(input));

      expect(outputs).to.eql(expectedOutputs);
    });
  });

  describe('isChannelPublic', () => {
    it('should identify whether a channel is public', () => {
      const inputTrue = config.slack.lunchChannelId;
      const inputFalse = 'D12HLASD2';

      expect(isChannelPublic(inputTrue)).to.be.true;
      expect(isChannelPublic(inputFalse)).to.be.false;
    });
  });

  describe('alreadyReacted', () => {
    it('should check if message has already been reacted to', () => {
      const inputTrue = [
        {
          name: 'flushed',
          users: ['me', 'my other self'],
        },
        {
          name: 'taco',
          users: [config.slack.botId],
        },
      ];
      const inputFalse = [{
        name: 'flushed',
        users: ['me', 'my other self'],
      }];

      expect(alreadyReacted(inputTrue)).to.be.true;
      expect(alreadyReacted(inputFalse)).to.be.false;
    });
  });

  describe('isOrder should identify', () => {
    it('presto orders', () => {
      const input = `${botHandle} presto1p2`;

      expect(isOrder(input)).to.be.true;
    });

    describe('pizza orders', () => {

      it('without size', () => {
        const input = `${botHandle} pizza2`;

        expect(isOrder(input)).to.be.true;
      });

      it('with size', () => {
        const inputs = [
          `${botHandle} pizza4v33`,
          `${botHandle} pizza5v40`,
          `${botHandle} pizza3v50`,
        ];

        inputs.forEach((input) => {
          expect(isOrder(input)).to.be.true;
        });
      });
    });

    it('veglife orders', () => {
      const inputs = [
        `${botHandle} veg3p`,
        `${botHandle} veg2`,
        `${botHandle} veg1s`,
      ];

      inputs.forEach((input) => {
        expect(isOrder(input)).to.be.true;
      });
    });

    it('shop orders', () => {
      const input = `${botHandle} nakup caj a mlieko`;

      expect(isOrder(input)).to.be.true;
    });

    it('non-orders', () => {
      const inputs = [
        'to neznie dobre',
        'veg presto pizza shop lalala',
      ];

      inputs.forEach((input) => {
        expect(isOrder(input)).to.be.false;
      });
    });
  });
});

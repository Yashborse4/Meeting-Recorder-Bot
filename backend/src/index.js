/**
 * backend/src/index.js
 * CLI runner and module export for the Google Meet Recording Bot
 */

const { MeetRecorderBot } = require('./meetBot');
const config = require('./config');

async function main() {
  const args = process.argv.slice(2);
  const meetingUrl = args[0] || 'https://meet.google.com/new';
  const durationMinutes = parseFloat(args[1]) || 2;
  const botName = args[2] || config.DEFAULT_BOT_NAME;

  console.log('====================================================');
  console.log('       Google Meet Automated Recording Bot          ');
  console.log('====================================================');
  console.log(`Meeting URL : ${meetingUrl}`);
  console.log(`Duration    : ${durationMinutes} minutes`);
  console.log(`Bot Name    : ${botName}`);
  console.log('====================================================\n');

  const bot = new MeetRecorderBot({ botName });

  try {
    await bot.launch();
    await bot.joinMeeting(meetingUrl);

    // Wait 3 seconds inside call before triggering capture
    await new Promise((r) => setTimeout(r, 3000));
    await bot.startRecording();

    console.log(`\n[Bot] Recording active for ${durationMinutes} minutes. Keep this window running...\n`);
    await new Promise((r) => setTimeout(r, durationMinutes * 60 * 1000));

    console.log('\n[Bot] Duration reached. Finalizing recording...');
    const output = await bot.stopRecording();

    console.log('\n[Bot] Recording session finished successfully!');
    console.log(`Saved output to: ${output.directory}`);
  } catch (err) {
    console.error('\n[Bot Error]:', err);
  } finally {
    await bot.close();
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { MeetRecorderBot, config };

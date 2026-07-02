const express = require('express');
const router  = express.Router();

const CRISIS_RESOURCES = [
  {
    country: 'Malaysia',
    resources: [
      { name: 'Befrienders Kuala Lumpur', phone: '03-7627 2929', available: '24/7' },
      { name: 'Talian Kasih',             phone: '15999',         available: '24/7' },
      { name: 'Mental Health Psychosocial Support (MHPSS)', phone: '03-2935 9935', available: 'Office hours' },
    ],
  },
  {
    country: 'International',
    resources: [
      { name: 'Crisis Text Line', phone: 'Text HOME to 741741', available: '24/7' },
      { name: 'International Association for Suicide Prevention', url: 'https://www.iasp.info/resources/Crisis_Centres/', available: '24/7' },
    ],
  },
  {
    country: 'United States',
    resources: [
      { name: '988 Suicide & Crisis Lifeline', phone: '988',         available: '24/7' },
      { name: 'Crisis Text Line',              phone: 'Text 741741', available: '24/7' },
    ],
  },
];

// GET /api/crisis/resources — no auth required
router.get('/resources', (req, res) => {
  res.json(CRISIS_RESOURCES);
});

module.exports = router;

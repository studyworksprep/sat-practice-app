-- Restore the missing underline on RW-00301's stimulus.
--
-- The stem ("Which choice best states the function of the
-- underlined sentence in the overall structure of the text?")
-- references an underlined sentence, but the stimulus_html had
-- no <u> markup — students saw three undifferentiated sentences
-- and couldn't tell which one the question was asking about.
-- Of 91 published questions that mention "underlined" in their
-- stem, this was the only one missing the markup.
--
-- Which sentence: the rationale identifies it explicitly — "The
-- underlined sentence then describes the data the team consulted
-- and how they were used (comparing predictions about earnings
-- to what the companies actually earned)." That's the second of
-- the three sentences in the stimulus paragraph.
--
-- Wrapper: <span role="region" aria-label="Referenced Content">
-- <u>...</u></span>, the same shape used by every other question
-- with an underlined region (sample: RW-00016, RW-01159).
--
-- The UPDATE is scoped to only fire when the stimulus is still
-- the broken pre-fix version, so a re-run is a no-op.

update public.questions_v2
set stimulus_html = '<p class="stimulus_paragraph">A study by a team including finance professor Madhu Veeraraghavan suggests that exposure to sunshine during the workday can lead to overly optimistic behavior. <span role="region" aria-label="Referenced Content"><u>Using data spanning from 1994 to 2010 for a set of US companies, the team compared over 29,000 annual earnings forecasts to the actual earnings later reported by those companies.</u></span> The team found that the greater the exposure to sunshine at work in the two weeks before a manager submitted an earnings forecast, the more the manager''s forecast exceeded what the company actually earned that year.</p>'
where display_code = 'RW-00301'
  and stimulus_html not like '%<u>%';

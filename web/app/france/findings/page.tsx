export default function FindingsPage() {
  return (
    <div className="fr-page fr-article">
      <header className="fr-article-header">
        <h1>French Public Procurement: Investigative Analysis</h1>
        <div className="fr-article-meta">
          <span>1,114,077 contracts</span>
          <span className="fr-article-sep">&middot;</span>
          <span>&euro;1,254.5B total spend</span>
          <span className="fr-article-sep">&middot;</span>
          <span>25,278 buyers</span>
          <span className="fr-article-sep">&middot;</span>
          <span>171,484 vendors</span>
        </div>
        <div className="fr-article-meta">
          <span>Period: 2015&ndash;2025 (bulk 2019&ndash;2025)</span>
          <span className="fr-article-sep">&middot;</span>
          <span>Source: DECP (Donn&eacute;es Essentielles de la Commande Publique)</span>
          <span className="fr-article-sep">&middot;</span>
          <span>Analysis date: 2026-03-16</span>
        </div>
      </header>

      {/* ── Part 1 ── */}
      <section className="fr-article-part">
        <h2>Part 1: Red Flags &amp; Suspicious Patterns</h2>

        <article className="fr-article-section">
          <h3>1.1 The No-Competition Epidemic Is Getting Worse, Not Better</h3>
          <p>
            The most alarming finding: <strong>non-competitive procurement is accelerating</strong>, not recovering post-COVID.
          </p>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="r">Total Contracts</th>
                  <th className="r">No-Competition</th>
                  <th className="r">No-Comp %</th>
                  <th className="r">No-Comp Spend</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>2019</td><td className="r">131,107</td><td className="r">2,875</td><td className="r"><strong>2.2%</strong></td><td className="r">&euro;1.77B</td></tr>
                <tr><td>2020</td><td className="r">144,236</td><td className="r">4,310</td><td className="r">3.0%</td><td className="r">&euro;3.03B</td></tr>
                <tr><td>2021</td><td className="r">178,969</td><td className="r">5,430</td><td className="r">3.0%</td><td className="r">&euro;4.56B</td></tr>
                <tr><td>2022</td><td className="r">185,625</td><td className="r">6,402</td><td className="r">3.4%</td><td className="r">&euro;3.95B</td></tr>
                <tr><td>2023</td><td className="r">143,758</td><td className="r">5,057</td><td className="r">3.5%</td><td className="r">&euro;3.74B</td></tr>
                <tr><td>2024</td><td className="r">156,653</td><td className="r">8,609</td><td className="r"><strong>5.5%</strong></td><td className="r"><strong>&euro;5.00B</strong></td></tr>
                <tr><td>2025</td><td className="r">139,265</td><td className="r">7,328</td><td className="r"><strong>5.3%</strong></td><td className="r"><strong>&euro;4.92B</strong></td></tr>
              </tbody>
            </table>
          </div>
          <p>
            No-competition procurement <strong>more than doubled</strong> from 2.2% to 5.5% between 2019 and 2024, and the absolute spend tripled from &euro;1.77B to &euro;5B. COVID emergency rules (2020&ndash;2021) appear to have permanently normalized non-competitive awards. This is not a data artifact &mdash; it&rsquo;s a structural shift in procurement culture.
          </p>
          <p>
            <strong>Important distinction &mdash; no-competition vs. single-bid:</strong> These are two different failure modes that are often conflated:
          </p>
          <ul>
            <li><strong>No-competition (5.5%)</strong> = the buyer used a procedure that <strong>explicitly bypasses competition</strong> (&ldquo;march&eacute; n&eacute;goci&eacute; sans publicit&eacute; ni mise en concurrence&rdquo;). No tender was published. The buyer went directly to a vendor.</li>
            <li><strong>Single-bid (27.6%)</strong> = a competitive tender <em>was</em> published, but <strong>only one company bothered to bid</strong> (bids_received = 1). The procedure allowed competition; it just didn&rsquo;t materialize.</li>
          </ul>
          <p>
            Both are worsening (single-bid rose from 22.8% in 2019 to 27.6% overall), and together they paint a grim picture: roughly <strong>a third of all contracts with bid data</strong> have zero meaningful competitive pressure &mdash; either because competition was forbidden or because it was theoretically possible but didn&rsquo;t happen in practice.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>1.2 The Nice-Vaucluse Procurement Complex</h3>
          <p>
            <strong>M&eacute;tropole Nice C&ocirc;te d&rsquo;Azur</strong> and <strong>D&eacute;partement du Vaucluse</strong> form the most suspicious procurement ecosystem in the dataset.
          </p>

          <h4>Nice (M&eacute;tropole + Commune combined)</h4>
          <ul>
            <li>Framework agreements of exactly &euro;399,999,996 (just under &euro;400M) for legal services split into 8+ lots covering every legal specialty (public law, criminal law, HR law, urban planning, etc.)</li>
            <li>Each lot has 6&ndash;9 co-contractor law firms (multi-vendor framework), all credited with the full &euro;400M ceiling</li>
            <li>Each lot is published as <strong>multiple DECP records</strong>: one &ldquo;March&eacute;&rdquo; (parent contract) plus 2&ndash;3 &ldquo;Accord-cadre&rdquo; sub-records (framework + call-offs), each with different UIDs but identical amounts and vendors</li>
            <li>The real exposure is the ceiling value (~&euro;400M per lot, ~&euro;3.2B across 8 lots), not the &euro;21B+ that naive aggregation produces</li>
            <li>Even corrected, the pattern is notable: Nice awarded <strong>~&euro;3.2B in multi-vendor legal framework agreements</strong> using &ldquo;proc&eacute;dure adapt&eacute;e&rdquo; (simplified procedure) &mdash; a procedure designed for small contracts below EU thresholds, applied at massive scale</li>
            <li>Ernst &amp; Young appears under two entity names, earning slots across multiple lots</li>
          </ul>

          <h4>Vaucluse</h4>
          <ul>
            <li>&euro;2.4B in no-competition spending across only 18 contracts (avg &euro;133.5M per contract)</li>
            <li>Multiple captive vendors earning 96&ndash;100% of their revenue from Vaucluse alone (multi-vendor inflation is minimal &mdash; these are mostly sole awardees):
              <ul>
                <li>Neotravaux: &euro;5.7B from Vaucluse (77 contracts, 96% of total revenue)</li>
                <li>4M Mereu BTP: &euro;3.3B from Vaucluse (65 contracts, 99% of total revenue)</li>
                <li>Bleue Comme Une Orange: &euro;3.2B from Vaucluse (8 contracts, 100% of total revenue)</li>
                <li>Roux TP: &euro;2.5B from Vaucluse (59 contracts, 97% of total revenue)</li>
                <li>Lions: &euro;2.4B from Vaucluse (13 contracts, 100% of total revenue)</li>
              </ul>
            </li>
            <li>Colas France entities (3&ndash;5 different legal entities, same SIREN): &euro;2.1B+ combined from Vaucluse</li>
            <li>Framework agreements routinely set at &euro;399,999,996 ceiling for road maintenance contracts</li>
          </ul>

          <p>
            <strong>The pattern:</strong> An ecosystem of construction, maintenance, and legal-services firms almost entirely dependent on one or two public buyers, with massive framework ceilings and no-competition procedures. This is the textbook definition of a captured procurement system.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>1.3 The Villefranche-sur-Sa&ocirc;ne Hospital Anomaly</h3>
          <p>
            <strong>Centre Hospitalier de Villefranche-sur-Sa&ocirc;ne</strong> (SIRET: 26690025700046) is technically a regional hospital but appears to function as a group purchasing organization:
          </p>
          <ul>
            <li><strong>&euro;979M</strong> for blood-derived medicines (single vendor: Swedish Orphan Biovitrum)</li>
            <li><strong>&euro;921M</strong> for groceries and beverages (vendor: Episaveurs, appearing 6+ times)</li>
            <li><strong>&euro;865M</strong> for pharmaceuticals (Janssen-Cilag)</li>
            <li><strong>&euro;793.7M</strong> in no-competition contracts total</li>
            <li>36.5% of all contracts subsequently modified</li>
            <li>Multiple contracts with 200&ndash;600% post-award inflation</li>
          </ul>
          <p>
            The hospital&rsquo;s contract values suggest it procures on behalf of a much larger hospital group. Whether this is data architecture or deliberate obscuration is unclear &mdash; but it effectively hides the true procurement patterns of dozens of hospitals behind a single entity.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>1.4 Amendment Inflation: The &ldquo;Win Low, Inflate Later&rdquo; Pattern</h3>
          <p>Contracts regularly balloon after award. The worst cases:</p>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Buyer</th>
                  <th className="r">Original</th>
                  <th className="r">Final</th>
                  <th className="r">Increase</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Waste collection CDA</td><td>La Rochelle Agglom&eacute;ration</td><td className="r">&euro;62.4M</td><td className="r">&euro;622.5M</td><td className="r">+898%</td></tr>
                <tr><td>Lab consumables</td><td>CH Villefranche</td><td className="r">&euro;66.5M</td><td className="r">&euro;465.7M</td><td className="r">+600%</td></tr>
                <tr><td>Municipal equipment, Sens</td><td>Commune de Sens</td><td className="r">&euro;4.9M</td><td className="r">&euro;358.1M</td><td className="r">+7,146%</td></tr>
                <tr><td>Bio lab solution</td><td>CHU Toulouse</td><td className="r">&euro;60M</td><td className="r">&euro;360M</td><td className="r">+500%</td></tr>
                <tr><td>Storm Alex road repair</td><td>Dept. Alpes-Maritimes</td><td className="r">&euro;20M</td><td className="r">&euro;160M</td><td className="r">+700%</td></tr>
                <tr><td>Road maintenance, Gennevilliers</td><td>Commune de Gennevilliers</td><td className="r">&euro;4.5M</td><td className="r">&euro;158.9M</td><td className="r">+3,423%</td></tr>
                <tr><td>Electricity (EDF)</td><td>CHU Toulouse</td><td className="r">&euro;2.2M</td><td className="r">&euro;100M</td><td className="r">+4,446%</td></tr>
                <tr><td>T2SA road works</td><td>Dept. Puy-de-D&ocirc;me</td><td className="r">&euro;405K</td><td className="r">&euro;140M</td><td className="r">+34,451%</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>Communaut&eacute; d&rsquo;Agglom&eacute;ration de Melun Val de Seine</strong> is the most extreme: <strong>79.5% of contracts modified</strong> with a net increase of <strong>&euro;28.9 billion</strong> across just 127 contracts. Even assuming some framework-agreement ceiling effects, this is extraordinary.
          </p>
          <p>
            <strong>D&eacute;partement des Alpes-Maritimes</strong> modified 66% of 3,814 contracts (11,464 total modifications) for &euro;4.5B in increases &mdash; and notably appears in the Temp&ecirc;te Alex emergency contracts where a single &euro;20M no-competition road-repair award inflated to &euro;160M.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>1.5 Threshold Avoidance: The &euro;215K Cliff</h3>
          <p>EU procurement thresholds require more rigorous procedures for larger contracts. Clear evidence of strategic pricing just below thresholds:</p>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Range</th>
                  <th className="r">Contracts</th>
                  <th>Interpretation</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>&euro;190K&ndash;&euro;215K (just under supplies threshold)</td><td className="r"><strong>46,221</strong></td><td></td></tr>
                <tr><td>&euro;215K&ndash;&euro;240K (just over supplies threshold)</td><td className="r"><strong>26,997</strong></td><td><strong>71% more contracts just under</strong></td></tr>
                <tr><td>&euro;120K&ndash;&euro;140K (just under services)</td><td className="r">46,987</td><td></td></tr>
                <tr><td>&euro;140K&ndash;&euro;160K (just over services)</td><td className="r">45,120</td><td>Mild clustering</td></tr>
                <tr><td>&euro;5.1M&ndash;&euro;5.38M (just under works)</td><td className="r">1,100</td><td></td></tr>
                <tr><td>&euro;5.38M&ndash;&euro;5.6M (just over works)</td><td className="r">896</td><td><strong>23% more just under</strong></td></tr>
              </tbody>
            </table>
          </div>
          <p>
            The supplies threshold (&euro;215K) shows the strongest avoidance signal. Nearly double the number of contracts land in the &euro;190&ndash;215K band compared to &euro;215&ndash;240K. This suggests systematic threshold gaming to avoid EU-level scrutiny.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>1.6 Weekend Awards &amp; Year-End Dumps</h3>
          <p><strong>Weekend contracts have significantly higher single-bid rates:</strong></p>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr><th>Day</th><th className="r">Contracts</th><th className="r">Single-Bid %</th></tr>
              </thead>
              <tbody>
                <tr><td>Saturday</td><td className="r">9,488</td><td className="r"><strong>34.6%</strong></td></tr>
                <tr><td>Sunday</td><td className="r">6,353</td><td className="r"><strong>31.9%</strong></td></tr>
                <tr><td>Weekday avg</td><td className="r">~215K</td><td className="r">~27.3%</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            15,841 contracts awarded on weekends with 5&ndash;7 percentage points higher single-bid rates. While some may be system posting artifacts, the higher non-competition rate warrants investigation.
          </p>
          <p>
            <strong>December is the biggest spending month</strong> (125,336 contracts, &euro;121B) &mdash; classic budget-dump behavior. November has the highest single-bid rate (30.5%), suggesting rushed year-end awards prioritize speed over competition.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>1.7 The IT Lock-In Economy</h3>
          <p>Software and IT services exhibit the most extreme vendor lock-in across all sectors:</p>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr><th>Sector</th><th className="r">Spend</th><th className="r">Single-Bid %</th><th className="r">No-Comp %</th></tr>
              </thead>
              <tbody>
                <tr><td>CPV 48 &ndash; Software</td><td className="r">&euro;24.7B</td><td className="r"><strong>68.2%</strong></td><td className="r"><strong>26.0%</strong></td></tr>
                <tr><td>CPV 72 &ndash; IT Services</td><td className="r">&euro;33.1B</td><td className="r"><strong>56.1%</strong></td><td className="r"><strong>29.5%</strong></td></tr>
              </tbody>
            </table>
          </div>

          <h4>How much is structural lock-in vs. genuinely non-competitive?</h4>
          <p>Breaking IT contracts down by type reveals that <strong>maintenance and hosting account for the bulk of non-competitive awards</strong>:</p>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="r">Contracts</th>
                  <th className="r">Spend</th>
                  <th className="r">Avg Bids</th>
                  <th className="r">Single-Bid %*</th>
                  <th className="r">No-Comp %</th>
                  <th className="r">Effective No-Comp %**</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Maintenance (CPV)</td><td className="r">6,766</td><td className="r">&euro;6.0B</td><td className="r">1.6</td><td className="r">85.3%</td><td className="r">60.5%</td><td className="r"><strong>~94%</strong></td></tr>
                <tr><td>Maintenance (keyword)</td><td className="r">6,743</td><td className="r">&euro;11.4B</td><td className="r">2.5</td><td className="r">57.8%</td><td className="r">32.1%</td><td className="r"><strong>~71%</strong></td></tr>
                <tr><td>Hosting / Cloud</td><td className="r">482</td><td className="r">&euro;2.3B</td><td className="r">2.2</td><td className="r">59.4%</td><td className="r">21.0%</td><td className="r">~68%</td></tr>
                <tr><td>Extensions / Upgrades</td><td className="r">394</td><td className="r">&euro;0.3B</td><td className="r">3.1</td><td className="r">54.0%</td><td className="r">26.6%</td><td className="r">~66%</td></tr>
                <tr><td>New acquisition (licenses)</td><td className="r">1,995</td><td className="r">&euro;4.8B</td><td className="r">2.6</td><td className="r">54.9%</td><td className="r">17.2%</td><td className="r">~63%</td></tr>
                <tr><td>New development</td><td className="r">1,034</td><td className="r">&euro;1.9B</td><td className="r">3.9</td><td className="r"><strong>32.5%</strong></td><td className="r"><strong>7.9%</strong></td><td className="r"><strong>~37%</strong></td></tr>
                <tr><td>Consulting / Advisory</td><td className="r">997</td><td className="r">&euro;2.9B</td><td className="r">3.9</td><td className="r">47.4%</td><td className="r">8.3%</td><td className="r">~52%</td></tr>
                <tr><td>Other/unclassified</td><td className="r">9,289</td><td className="r">&euro;28.1B</td><td className="r">3.9</td><td className="r">47.1%</td><td className="r">10.6%</td><td className="r">~53%</td></tr>
              </tbody>
            </table>
          </div>
          <p className="fr-article-footnote">
            *Single-bid % is calculated only among contracts with bid data (i.e., those that held a tender). No-comp contracts have no bid data and are excluded from this denominator.
          </p>
          <p className="fr-article-footnote">
            **Effective no-competition = no-comp% + (1 - no-comp%) &times; single-bid%. This combines both failure modes: contracts where no tender was held + contracts where a tender was held but only 1 firm bid.
          </p>

          <p>
            <strong>The maintenance trap is real:</strong> CPV-classified maintenance contracts have an effective no-competition rate of <strong>~94%</strong> &mdash; meaning only ~6% of maintenance contracts face genuine competition with 2+ bidders. Compare to new development at ~37%.
          </p>

          <h4>The specific software products creating lock-in chains</h4>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr><th>Software</th><th>Vendor</th><th>Domain</th><th>No-Comp Maintenance Pattern</th></tr>
              </thead>
              <tbody>
                <tr><td><strong>IODAS</strong></td><td>Inetum Software France</td><td>Social services mgmt</td><td>365 maint. contracts, 121 buyers, <strong>100% single bid, 79.5% no-comp</strong></td></tr>
                <tr><td><strong>Ciril / Civil Net RH</strong></td><td>Ciril Group</td><td>HR management</td><td>248 maint. contracts, 153 buyers, <strong>86.7% single bid, 57.3% no-comp</strong></td></tr>
                <tr><td><strong>HR Access</strong></td><td>Sopra HR Software</td><td>HR &amp; payroll</td><td>45 maint. contracts, 22 buyers, <strong>81.8% single bid, 57.8% no-comp</strong></td></tr>
                <tr><td><strong>C3RB</strong></td><td>C3RB Informatique</td><td>Library / cultural</td><td>75 maint. contracts, 55 buyers, <strong>87.5% single bid, 57.3% no-comp</strong></td></tr>
                <tr><td><strong>ASTRE</strong></td><td>GFI / Inetum</td><td>Financial mgmt</td><td>No-comp contracts in Vitrolles (&euro;40M), SDIS (&euro;5.5M)</td></tr>
                <tr><td><strong>PROGOS / PDA</strong></td><td>MGDIS</td><td>Grants management</td><td>No-comp in Normandie (&euro;10M), Occitanie (&euro;5M)</td></tr>
                <tr><td><strong>Smart Police</strong></td><td>Edicia SAS</td><td>Police software</td><td>Nice: &euro;11.2M no-competition</td></tr>
                <tr><td><strong>OpenMedia</strong></td><td>CGI France</td><td>Broadcast systems</td><td>France T&eacute;l&eacute;visions: &euro;5.4M no-comp</td></tr>
                <tr><td><strong>ALPHASTUDIO</strong></td><td>E Syst&egrave;mes</td><td>Photo library</td><td>Dunkerque: &euro;8M no-comp (for a photo library!)</td></tr>
                <tr><td><strong>Oracle DB</strong></td><td>Oracle</td><td>Database</td><td>Various: perpetual maintenance lock-in</td></tr>
                <tr><td><strong>Flowbird/GGOS</strong></td><td>Flowbird</td><td>Parking systems</td><td>Lyon: &euro;5M no-comp</td></tr>
              </tbody>
            </table>
          </div>

          <h4>The lock-in lifecycle</h4>
          <ol>
            <li>Vendor wins initial competitive bid (or gets installed via framework)</li>
            <li>System gets customized, staff trained, data locked in proprietary formats</li>
            <li>Maintenance/support contracts awarded without competition because &ldquo;only the original vendor can maintain it&rdquo;</li>
            <li>Cycle repeats indefinitely &mdash; Inetum has been maintaining IODAS across 121 d&eacute;partements/communes with zero competition</li>
          </ol>
          <p>
            <strong>Is this legitimate or a red flag?</strong> Both. Software maintenance genuinely requires vendor-specific knowledge, and migration costs can exceed years of maintenance fees. But the <em>scale</em> is the problem: <strong>&euro;17.4B in maintenance spending at 57&ndash;85% single-bid rates</strong> means buyers have effectively surrendered competitive leverage permanently.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>1.8 Systematic Data Concealment</h3>
          <p>Three massive transparency failures compound each other: missing competition data, opaque descriptions, and framework agreements that function as black boxes.</p>

          <h4>A. 74% of contracts have no bid data</h4>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr><th>Field</th><th className="r">Missing/Null</th><th className="r">% of Total</th></tr>
              </thead>
              <tbody>
                <tr><td>Bids received</td><td className="r">824,519</td><td className="r"><strong>74.0%</strong></td></tr>
                <tr><td>Location code</td><td className="r">122,991</td><td className="r">11.0%</td></tr>
                <tr><td>CPV code</td><td className="r">2,788</td><td className="r">0.3%</td></tr>
                <tr><td>Notification date</td><td className="r">810</td><td className="r">0.1%</td></tr>
                <tr><td>Buyer SIRET</td><td className="r">684</td><td className="r">0.1%</td></tr>
                <tr><td>Contract object</td><td className="r">1</td><td className="r">~0%</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            The bid data gap is not random &mdash; it improved dramatically only in 2024&ndash;2025. Before 2024, bid competition was essentially invisible (2019: 0.4% of contracts had bid data; 2024: 79.0%). The 2024 improvement suggests regulatory pressure forced disclosure, but the historical record is essentially a black box.
          </p>

          <h4>B. Opaque descriptions hiding what&rsquo;s actually being bought</h4>
          <p><strong>14,006 contracts over &euro;1M</strong> (totaling <strong>&euro;121.6B</strong>) have descriptions under 30 characters or just a lot number:</p>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr><th>Description Quality</th><th className="r">Contracts (&gt;&euro;1M)</th><th className="r">Spend</th></tr>
              </thead>
              <tbody>
                <tr><td>Very short (&lt;15 chars)</td><td className="r">1,243</td><td className="r"><strong>&euro;12.6B</strong></td></tr>
                <tr><td>Short (15&ndash;30 chars)</td><td className="r">7,340</td><td className="r"><strong>&euro;59.2B</strong></td></tr>
                <tr><td>Lot number only</td><td className="r">5,423</td><td className="r"><strong>&euro;49.8B</strong></td></tr>
              </tbody>
            </table>
          </div>
          <p>Examples of high-value contracts where the description is effectively meaningless:</p>
          <ul>
            <li><strong>&ldquo;23M02 GAULOYS JANSSEN CILAG&rdquo;</strong> &mdash; &euro;865M. An internal reference code.</li>
            <li><strong>&ldquo;TKE ELEVATOR&rdquo;</strong> &mdash; &euro;795M from a nursing home. A vendor name, not a contract description.</li>
            <li><strong>&ldquo;DSP ISDND UVE&rdquo;</strong> &mdash; &euro;842M. Pure abbreviations.</li>
            <li><strong>&ldquo;AC CENTRALIS AMTP BDC&rdquo;</strong> &mdash; &euro;500M. Completely opaque.</li>
          </ul>

          <h4>C. The framework agreement black box &mdash; &euro;227B with zero spend visibility</h4>
          <p>
            This may be the single most important transparency gap in the entire dataset.
          </p>
          <p>
            Of 175,956 framework agreements (accords-cadres): <strong>146,188 (83%)</strong> have <strong>zero modifications recorded</strong> &mdash; meaning there is no public record of any call-off, actual order, or spend. These zero-visibility frameworks represent <strong>&euro;226.8B in ceiling values</strong>.
          </p>
          <p>
            A buyer publishes a framework agreement with a ceiling of, say, &euro;400M. They then make individual call-offs under that framework for years. But <strong>none of those call-offs appear in the DECP data.</strong> The public sees the ceiling (&euro;400M) but has no way to know how much was actually spent, which vendors got the work, or what specific services were delivered.
          </p>
          <p>
            Framework agreements effectively function as pre-approved spending authorities with no subsequent accountability. <strong>&euro;227B in public money is allocated through frameworks where the public can see the envelope but nothing inside it.</strong>
          </p>

          <h4>D. Data quality issues</h4>
          <ul>
            <li><strong>898 contracts</strong> with sentinel values &ge;&euro;999M (and 194 &ge;&euro;9.99B)</li>
            <li><strong>163 contracts</strong> clustering at exactly &euro;399,999,996 (framework ceiling sentinels)</li>
            <li><strong>756 contracts</strong> with suspiciously round values &ge;&euro;100M</li>
            <li><strong>141 contracts</strong> with notification dates in the future (some as far as 2089)</li>
            <li><strong>113 contracts</strong> dated before 2010</li>
          </ul>
        </article>

        <article className="fr-article-section">
          <h3>1.9 DECP Reporting Format Creates Phantom Duplicates</h3>
          <p>
            Many high-value contracts appear 4&ndash;14 times in the database. Investigation reveals this is primarily the DECP reporting format: a single framework agreement generates multiple records (one &ldquo;March&eacute;&rdquo; parent + multiple &ldquo;Accord-cadre&rdquo; sub-records), each with a distinct UID but the same ceiling value and vendor list.
          </p>
          <p>Worst cases:</p>
          <ul>
            <li><strong>R&eacute;gion Hauts-de-France</strong>: &ldquo;PROGRAMME REGIONAL DE FORMATION SFER&rdquo; at &euro;800M &mdash; <strong>91 records</strong></li>
            <li><strong>Vaucluse road maintenance</strong> lots: 5&ndash;14 records each at &euro;400M</li>
            <li><strong>Nice/M&eacute;tropole legal services</strong>: 4 records per lot at &euro;400M, each listing all 9 co-contractor firms</li>
          </ul>
          <p>
            Naive aggregation dramatically overstates spend. This isn&rsquo;t necessarily deliberate &mdash; it&rsquo;s how the DECP format works &mdash; but it makes the data actively misleading for anyone who doesn&rsquo;t understand the reporting structure.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>1.10 Geographical Hotspots</h3>
          <p>D&eacute;partements with worst single-bid rates (2020+, &gt;1000 contracts):</p>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr><th>Dept</th><th className="r">Single-Bid %</th><th className="r">No-Comp %</th><th className="r">Spend</th></tr>
              </thead>
              <tbody>
                <tr><td>90 (Belfort)</td><td className="r"><strong>48.1%</strong></td><td className="r">15.5%</td><td className="r">&euro;49.8B</td></tr>
                <tr><td>13 (Bouches-du-Rh&ocirc;ne)</td><td className="r"><strong>46.0%</strong></td><td className="r">8.4%</td><td className="r">&euro;27.8B</td></tr>
                <tr><td>06 (Alpes-Maritimes)</td><td className="r"><strong>35.8%</strong></td><td className="r">7.2%</td><td className="r">&euro;92.0B</td></tr>
                <tr><td>20 (Corse)</td><td className="r"><strong>36.8%</strong></td><td className="r">6.2%</td><td className="r">&euro;2.8B</td></tr>
                <tr><td>97 (Overseas territories)</td><td className="r">31.8%</td><td className="r">3.8%</td><td className="r">&euro;37.4B</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Belfort&rsquo;s 48.1% single-bid rate is extreme. Bouches-du-Rh&ocirc;ne (Marseille/Aix) and Alpes-Maritimes (Nice) both feature prominently. Corsica&rsquo;s high rates align with historical procurement concerns on the island.
          </p>
        </article>
      </section>

      {/* ── Part 2 ── */}
      <section className="fr-article-part">
        <h2>Part 2: Business Opportunities</h2>

        <article className="fr-article-section">
          <h3>2.1 The IT Services Gold Mine</h3>
          <p>
            <strong>The single biggest opportunity is French public-sector IT.</strong> &euro;57.8B in combined IT spending (CPV 48 + 72) with the worst competition metrics of any major sector: 56&ndash;68% single-bid, 26&ndash;30% no-competition.
          </p>
          <h4>Why it&rsquo;s wide open</h4>
          <ol>
            <li><strong>Vendor lock-in is the norm.</strong> Maintenance contracts (CPV 72267) have 87&ndash;94% single-bid rates. Once you&rsquo;re in, you&rsquo;re in for life.</li>
            <li><strong>Incumbents are complacent.</strong> Computacenter wins 98% of its contracts with a single bid.</li>
            <li><strong>Buyers want alternatives but can&rsquo;t find them.</strong> The 29.5% no-competition rate suggests buyers routinely claim they have no choice.</li>
            <li><strong>Regulatory pressure is increasing.</strong> The 2024 bid data improvement shows regulators are adding transparency requirements.</li>
          </ol>

          <h4>Specific opportunities</h4>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr><th>Sub-Category</th><th className="r">Spend</th><th className="r">Single-Bid %</th><th>Opportunity</th></tr>
              </thead>
              <tbody>
                <tr><td>Software packages (CPV 48000)</td><td className="r">&euro;8.0B</td><td className="r">75&ndash;85%</td><td>Open-source alternatives to proprietary public-sector software</td></tr>
                <tr><td>Software maintenance (CPV 72267)</td><td className="r">&euro;2.5B</td><td className="r">87&ndash;94%</td><td>Multi-vendor support contracts breaking vendor lock</td></tr>
                <tr><td>IT infrastructure (CPV 72500)</td><td className="r">&euro;4.0B</td><td className="r">45&ndash;68%</td><td>Cloud hosting + managed services</td></tr>
                <tr><td>Computer services (CPV 72260)</td><td className="r">&euro;646M</td><td className="r">77&ndash;79%</td><td>Application management &amp; hosting</td></tr>
                <tr><td>Data processing (CPV 72310)</td><td className="r">&euro;1.4B</td><td className="r">67%</td><td>Data platform services</td></tr>
              </tbody>
            </table>
          </div>

          <h4>Entry strategy &mdash; the maintenance wedge</h4>
          <p>The highest-value targets (most buyers, deepest lock-in):</p>
          <ol>
            <li><strong>IODAS</strong> (Inetum) &mdash; social services mgmt &mdash; 121 buyers locked in at 100% single-bid</li>
            <li><strong>Ciril/Civil Net RH</strong> (Ciril Group) &mdash; HR mgmt &mdash; 153 buyers at 86.7% single-bid</li>
            <li><strong>ASTRE</strong> (GFI/Inetum) &mdash; financial mgmt &mdash; deployed across dozens of collectivit&eacute;s</li>
            <li><strong>HR Access</strong> (Sopra HR) &mdash; payroll &mdash; 22 buyers at 81.8% single-bid</li>
          </ol>
          <p>
            French procurement law requires buyers to <strong>justify</strong> no-competition awards. The standard justification is &ldquo;only this vendor can maintain the system.&rdquo; If a second vendor credibly offers maintenance, that justification collapses. Win maintenance for 10 entities and you&rsquo;ve built the expertise to bid on all 121.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>2.2 Healthcare Procurement</h3>
          <p>
            &euro;64.4B in medical equipment (CPV 33) with 43.2% single-bid rate and 9% no-competition.
          </p>
          <ul>
            <li><strong>Medical devices:</strong> CPV 33 has 14.6 average bids per contract but 43% single-bid rate &mdash; many contracts attract bids but certain sub-categories are locked up</li>
            <li><strong>Diagnostic equipment:</strong> Roche, BioM&eacute;rieux, Beckman Coulter win 73&ndash;84% of contracts as single bidder. AI-assisted diagnostics could break these monopolies.</li>
            <li><strong>Hospital IT:</strong> RESAH awarded &euro;20M to Capgemini and &euro;18M to SCC without competition for cloud/IT consulting.</li>
          </ul>
        </article>

        <article className="fr-article-section">
          <h3>2.3 Training &amp; Education Services</h3>
          <p>
            &euro;97.6B in education and training (CPV 80) &mdash; the second largest sector by spend with 30.2% single-bid rate.
          </p>
          <p>
            <strong>R&eacute;gion Hauts-de-France</strong> alone has a &euro;800M framework for professional training. Multiple training companies earn 100% of their revenue from this single region (AFCI: &euro;7.2B, CREFO: &euro;4.0B, ID Formation: &euro;3.3B, ADAPECO: &euro;3.2B).
          </p>
          <p>
            <strong>Opportunity:</strong> Government-funded vocational training is a massive, poorly competed market. An AI-powered training platform could offer personalized professional development at scale, undercutting incumbent classroom-based training providers.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>2.4 Business Services &amp; Consulting</h3>
          <div className="fr-article-table-wrap">
            <table>
              <thead>
                <tr><th>Sub-Category</th><th className="r">Spend</th><th className="r">Single-Bid %</th><th>Opportunity</th></tr>
              </thead>
              <tbody>
                <tr><td>Accounting/audit (79210)</td><td className="r">&euro;28.9B</td><td className="r">28.8%</td><td>Moderate competition</td></tr>
                <tr><td>Advertising/marketing (79341)</td><td className="r">&euro;2.1B</td><td className="r"><strong>56.6%</strong></td><td><strong>Weak competition, 25% no-comp</strong></td></tr>
                <tr><td>Temporary staffing (79620)</td><td className="r">&euro;4.8B</td><td className="r">17.7%</td><td>Well-competed</td></tr>
                <tr><td>Event management (79952)</td><td className="r">&euro;576M</td><td className="r"><strong>47.2%</strong></td><td><strong>13.5% no-comp</strong></td></tr>
                <tr><td>Translation (79530)</td><td className="r"></td><td className="r"><strong>80%</strong></td><td>Ripe for AI disruption</td></tr>
                <tr><td>Surveying (79342)</td><td className="r">&euro;349M</td><td className="r"><strong>80%</strong></td><td><strong>32.6% no-comp</strong></td></tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>Translation services</strong> (CPV 79530) at 80% single-bid are an obvious target for AI translation tools.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>2.5 Waste Management &amp; Environmental</h3>
          <p>
            CPV 90 (sewage &amp; waste) represents &euro;76.8B &mdash; the third-largest sector with 29.5% single-bid. Dominated by Suez and Veolia. Dunkerque awarded &euro;693M for waste sorting without competition.
          </p>
          <p>Opportunities: smart waste management (IoT + AI route optimization), recycling innovation, environmental consulting.</p>
        </article>

        <article className="fr-article-section">
          <h3>2.6 Energy Services</h3>
          <p>
            &euro;42.6B in petroleum/fuel (CPV 09) with 36.2% single-bid rate. Energy price hedging and procurement optimization is under-served. EV charging infrastructure procurement is growing rapidly.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>2.7 Construction: The Volume Play</h3>
          <p>
            CPV 45 (construction) is the largest sector at <strong>&euro;397.9B</strong> with a relatively competitive 20% single-bid rate and 6.0 average bids. But the Nice/Vaucluse ecosystem shows how local markets can be captured. Framework agreements for road maintenance create long-term lock-in. 1.8% no-competition rate is low but at &euro;397B, that&rsquo;s still &euro;7B+ without competition.
          </p>
        </article>
      </section>

      {/* ── Part 3 ── */}
      <section className="fr-article-part">
        <h2>Part 3: Structural Issues &amp; Methodology Notes</h2>

        <article className="fr-article-section">
          <h3>3.1 Multi-Vendor Double Counting in Per-Vendor Figures</h3>
          <p>
            ~108K contracts have multiple vendors. When computing per-vendor spend via the join table, each co-vendor is credited the <strong>full contract amount</strong> &mdash; inflating total vendor spend by ~80% at the aggregate level (&euro;1,254B becomes &euro;2,259B).
          </p>
          <p>
            All <strong>top-line stats</strong> (total spend, sector breakdowns, buyer-level figures) are computed directly from <code>france_contracts</code> and are <strong>not affected</strong>. Per-vendor spend figures are upper bounds. Competition metrics (single-bid %, no-comp %) are based on contract counts, not amounts, and are also not affected.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>3.2 Framework Agreements Distort Everything</h3>
          <p>
            Many of the largest &ldquo;contracts&rdquo; are actually accords-cadres (framework agreements) with ceiling values, not actual spend. A &euro;400M framework ceiling doesn&rsquo;t mean &euro;400M was spent. Any serious analysis should separate march&eacute;s from accords-cadres and treat framework ceilings as upper bounds.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>3.3 Entity Merging Is Broken</h3>
          <p>
            Vendors appear under multiple names and IDs: Orange has 3+ entities per buyer, Colas France has 5+ entities within single d&eacute;partements, law firms appear with different capitalizations. Without SIREN-level entity resolution, vendor concentration analysis understates true market dominance.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>3.4 Buyer Aggregation Obscures Scale</h3>
          <p>
            Group purchasing organizations (RESAH, Villefranche &ldquo;hospital&rdquo;, UGAP) report as single buyers but represent hundreds of end-users. Conversely, M&eacute;tropole Nice and Commune de Nice report separately but are essentially the same procurement operation.
          </p>
        </article>

        <article className="fr-article-section">
          <h3>3.5 What the Data Cannot Show</h3>
          <ul>
            <li><strong>Actual spend</strong> (only contract amounts and framework ceilings)</li>
            <li><strong>Quality of delivery</strong> (were contracts fulfilled satisfactorily?)</li>
            <li><strong>Subcontracting</strong> (who actually does the work?)</li>
            <li><strong>Revolving-door connections</strong> (do procurement officers move to winning vendors?)</li>
            <li><strong>Political connections</strong> (which vendors donate to which parties?)</li>
            <li><strong>Beneficial ownership</strong> (who ultimately owns the winning vendors?)</li>
          </ul>
          <p>
            The DECP data shows the skeleton of procurement, but the real corruption signals require cross-referencing with company registries, political donation records, and financial disclosures.
          </p>
        </article>
      </section>

      {/* ── Summary ── */}
      <section className="fr-article-part">
        <h2>Summary: Top Investigation Targets</h2>
        <ol className="fr-article-targets">
          <li><strong>The framework black box</strong> &mdash; &euro;227B in framework ceilings (83% of all frameworks) with zero public record of actual spend, call-offs, or vendor allocation</li>
          <li><strong>The no-competition acceleration</strong> &mdash; doubled from 2.2% to 5.5% post-COVID with no sign of reversal, tripling in absolute spend to &euro;5B/year</li>
          <li><strong>IT maintenance lock-in</strong> &mdash; ~94% effective no-competition rate on CPV-classified maintenance; named products (IODAS, Ciril, ASTRE, HR Access) lock 100+ buyers each into perpetual single-vendor dependency</li>
          <li><strong>The Nice-Vaucluse procurement complex</strong> &mdash; captive vendor relationships (96&ndash;100% revenue dependency), massive framework ceilings, &euro;3.2B in legal frameworks via simplified procedure</li>
          <li><strong>Opaque descriptions</strong> &mdash; &euro;121.6B in contracts &gt;&euro;1M with descriptions under 30 characters or just lot numbers</li>
          <li><strong>Amendment inflation</strong> &mdash; Melun Val de Seine: &euro;28.9B in modifications at 79.5% modification rate; Alpes-Maritimes: 11,464 modifications across 66% of contracts</li>
          <li><strong>Threshold gaming at &euro;215K</strong> &mdash; 71% more contracts land just under the EU supplies threshold than just above it</li>
          <li><strong>The 74% bid-data black hole</strong> &mdash; nearly three quarters of historical contracts have no competition data; only improved in 2024 under regulatory pressure</li>
        </ol>
      </section>
    </div>
  );
}

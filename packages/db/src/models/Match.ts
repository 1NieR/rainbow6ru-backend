import { MATCH_TYPE } from '@r6ru/types';
import { AllowNull, BelongsTo, Column, DataType, Default, ForeignKey, HasMany, HasOne, Model, Table } from 'sequelize-typescript';
import MapR6 from './MapR6';
import Team from './Team';
import Tournament from './Tournament';
import Vote from './Vote';

@Table({schema: 'streambot'})
export default class Match extends Model<Match> {

    @Column(DataType.STRING(5))
    public matchType: MATCH_TYPE;

    @Column(DataType.ARRAY(DataType.INTEGER))
    public mapScore: [number, number];

    @Default(false)
    @AllowNull(false)
    @Column
    public legacy: boolean;

    @Default(false)
    @AllowNull(false)
    @Column
    public ready: boolean;

    @HasMany(() => Vote)
    public votes: Vote[];

    @Column(DataType.JSONB)
    public poolCache: MapR6[];

    @ForeignKey(() => Team)
    public team0Id: number;
    @BelongsTo(() => Team, 'team0Id')
    public team0: Team;

    @ForeignKey(() => Team)
    public team1Id: number;
    @BelongsTo(() => Team, 'team1Id')
    public team1: Team;

    @ForeignKey(() => Tournament)
    @Column
    public tournamentId: number;

    @BelongsTo(() => Tournament)
    public tournament: Tournament;

    @Column
    public swapped: boolean;
}
